import Decimal from 'decimal.js';
import {Node} from '../../model/gillespie/Node';
import {isRateCallback, Reaction} from '../../model/gillespie/Reaction';
import {RandomGenerator} from '../../random/RandomGenerator';
import {Xorshift128Plus} from '../../random/Xorshift128Plus';
import {Simulator} from '../Simulator';
import {NodeWithQuantity} from '../../model/gillespie';

/**
 * Strategy for drawing the time increment until the next reaction fires, given
 * the current total propensity (activity sum) and the simulator's random
 * generator. Returning a `number` is allowed for convenience and is converted
 * to a {@link Decimal}.
 *
 * The default {@link exponentialTimeDraw} implements the standard Gillespie SSA
 * exponential waiting time; supply a custom one for non-Markovian waiting
 * times, deterministic stepping, variance reduction, etc.
 */
export type TimeDraw = (
	totalPropensity: Decimal,
	random: RandomGenerator
) => Decimal | number;

/**
 * Default {@link TimeDraw}: an exponentially distributed waiting time with rate
 * equal to the total propensity, sampled by inverse transform as
 * `ln(1 / r) / totalPropensity` with `r` uniform in `[0, 1)`.
 */
export const exponentialTimeDraw: TimeDraw = (totalPropensity, random) =>
	Decimal.ln(Decimal.div(1, random.nextDouble())).div(totalPropensity);

/**
 * Listener invoked once for every step appended to the trajectory: the initial
 * start step first (reported during construction when the listener is supplied
 * via {@link GillespieOptions.onStep}), then every step produced by
 * {@link GillespieSimulator.step} or {@link GillespieSimulator.inject}. Seeing
 * the start step lets a listener persist the complete trajectory, initial state
 * included.
 *
 * The listener is handed both the {@link Step} and `speciesCounts`, a fresh copy
 * of the full count vector at that step - so it never has to reconstruct the
 * state from the log (this also works with `retainHistory: false`, where later
 * reconstruction is impossible). The copy is the listener's own to keep or
 * mutate; it is not the simulator's live vector.
 *
 * This is the streaming hook: combined with `retainHistory: false` it lets a
 * consumer write each step to disk / aggregate / downsample as it is produced
 * while the simulator holds only O(species) state in memory regardless of how
 * many steps run.
 */
export type StepListener = (step: Step, speciesCounts: bigint[]) => void;

/**
 * Optional configuration for a {@link GillespieSimulator}.
 */
export interface GillespieOptions {
	/**
	 * When `true` (default) every step is kept, so the whole trajectory stays in
	 * memory and any step can be reconstructed at random. When `false` only the
	 * start and the current last step are retained (O(species) memory); use
	 * {@link GillespieOptions.onStep} to stream the trajectory out as it runs.
	 */
	readonly retainHistory?: boolean;
	/** Streaming listener, see {@link StepListener}. */
	readonly onStep?: StepListener | null;
}

/**
 * A single (signed) change to the species-count vector, expressed as a sparse
 * list of `[speciesIndex, delta]` pairs. Only steps whose change is not implied
 * by a fired reaction (i.e. injections) carry one.
 */
type CountDelta = ReadonlyArray<readonly [number, bigint]>;

export class GillespieSimulator extends Simulator {
	private readonly nodes: Node[];
	private readonly nodesOrder = new Map<Node, number>();
	private readonly reactions: Reaction[];
	/**
	 * The retained event log. With retention on this holds every step and its
	 * array index equals the step's absolute {@link Step.index}. With retention
	 * off it holds only `[start, last]`.
	 */
	private readonly steps: Step[] = [];
	private readonly lastReactionPropensities: (Decimal | null)[];
	private readonly nodeToReactionsMap = new Map<Node, Set<number>>();
	private lastPartialTotalPropensity = Decimal(0);
	/**
	 * The rate currently in effect for each reaction. For fixed rates this is
	 * the constant; for dynamic (callback) rates it is the value returned by the
	 * most recent callback call, or `null` before the callback has ever run.
	 */
	private readonly currentRates: (Decimal | null)[];
	/**
	 * Whether each reaction's rate still needs to be resolved via its callback.
	 * Fixed rates start `false`; a callback rate starts `true` and flips to
	 * `false` once the callback opts into caching (see {@link RateResult.cache}).
	 */
	private readonly rateIsDynamic: boolean[];
	/** Strategy for drawing the waiting time until the next reaction. */
	private readonly drawTime: TimeDraw;
	/**
	 * The live species-count vector, mutated in place on every fire/injection.
	 * This is the single source of truth for the current state - propensity
	 * evaluation reads it and reconstruction of any past step replays the event
	 * log forward from {@link startCounts}. Keeping one vector (instead of a full
	 * copy per step) is what turns the memory cost from O(steps * species) into
	 * O(steps) + O(species).
	 */
	private currentCounts: bigint[] = [];
	/** Snapshot of the counts at the start step - the reconstruction anchor. */
	private startCounts: bigint[] = [];
	/** Explicit deltas for injection steps, keyed by absolute step index. */
	private readonly stepDeltas = new Map<number, CountDelta>();
	/** See {@link GillespieOptions.retainHistory}. Fixed at construction. */
	private readonly retainHistory: boolean;
	/** See {@link GillespieOptions.onStep}. Fixed at construction. */
	private readonly onStepListener: StepListener | null;

	constructor(
		nodes: Node[],
		reactions: Reaction[],
		random: RandomGenerator = new Xorshift128Plus(42n),
		drawTime: TimeDraw = exponentialTimeDraw,
		options: GillespieOptions = {}
	) {
		super(random);
		this.drawTime = drawTime;
		this.retainHistory = options.retainHistory ?? true;
		this.onStepListener = options.onStep ?? null;
		this.nodes = nodes;
		this.nodes.forEach((n, i) => this.nodesOrder.set(n, i));
		this.reactions = reactions;
		this.lastReactionPropensities = new Array(reactions.length).fill(null);
		this.currentRates = reactions.map((r) =>
			isRateCallback(r.rate) ? null : r.rate
		);
		this.rateIsDynamic = reactions.map((r) => isRateCallback(r.rate));
		this.nodes.forEach((n) => this.nodeToReactionsMap.set(n, new Set()));
		this.reactions.forEach((r, i) => {
			r.from.forEach((n) => this.nodeToReactionsMap.get(n.node)!.add(i));
		});
		this.initialize(Decimal(0));
	}

	private initialize(startTime: Decimal): void {
		this.steps.length = 0;
		this.stepDeltas.clear();
		this.startCounts = this.nodes.map((n) => n.startCount);
		this.currentCounts = this.nodes.map((n) => n.startCount);
		// Record the start step through the normal path so a listener supplied at
		// construction sees the initial state first and can persist the full
		// trajectory. recordStep pins it at index 0, so it survives even with
		// retention off.
		this.recordStep(new Step(this, 0, startTime, null));
	}

	public addReaction(reaction: Reaction) {
		if (!this.reactions.includes(reaction)) {
			const reactionIndex = this.reactions.length;
			reaction.from.forEach((n) => {
				this.addNode(n.node);
				this.nodeToReactionsMap.get(n.node)!.add(reactionIndex);
			});
			reaction.to.forEach((n) => this.addNode(n.node));
			this.reactions.push(reaction);
			this.lastReactionPropensities.push(null);
			this.currentRates.push(
				isRateCallback(reaction.rate) ? null : reaction.rate
			);
			this.rateIsDynamic.push(isRateCallback(reaction.rate));
		}
	}

	public addNode(node: Node) {
		if (!this.nodesOrder.has(node)) {
			this.nodesOrder.set(node, this.nodes.length);
			this.nodes.push(node);
			this.nodeToReactionsMap.set(node, new Set());
			// Extend only the live vector and the start snapshot with a fresh 0n; the
			// late node's startCount is intentionally ignored. Past steps do not store
			// counts anymore, so there is nothing to back-fill - reconstruction reads
			// the new index as 0n until a delta touches it.
			this.currentCounts.push(0n);
			this.startCounts.push(0n);
		}
	}

	public step(
		endTime: Decimal | number | null = null,
		advanceToEndTime = false
	): boolean {
		const currentTime = this.steps[this.steps.length - 1].time;
		const count = (node: Node): bigint =>
			this.currentCounts[this.nodesOrder.get(node)!];
		const propensities = this.reactions.map((r, i) => {
			// Resolve dynamic rates. Fixed rates, and callbacks that opted into
			// caching, keep their frozen value and skip the callback entirely.
			if (this.rateIsDynamic[i] && isRateCallback(r.rate)) {
				const result = r.rate({reaction: r, time: currentTime, count});
				const newRate =
					typeof result.rate === 'number' ? Decimal(result.rate) : result.rate;
				if (result.cache) {
					// Freeze the rate, from now on it behaves like a fixed rate.
					this.rateIsDynamic[i] = false;
				}
				const current = this.currentRates[i];
				if (current === null || !newRate.equals(current)) {
					// The rate changed compared to the previous call, so the cached
					// propensity is stale and must be recomputed below. If it did not
					// change we keep the cache (best of both worlds).
					this.invalidatePropensity(i);
					this.currentRates[i] = newRate;
				}
			}
			let p = this.lastReactionPropensities[i];
			if (p === null) {
				p = this.calculatePropensity(
					r,
					this.currentRates[i]!,
					this.currentCounts
				);
				this.lastPartialTotalPropensity =
					this.lastPartialTotalPropensity.add(p);
				this.lastReactionPropensities[i] = p;
			}
			return p;
		});
		const totalPropensity = this.lastPartialTotalPropensity;
		let remainingPropensity = totalPropensity.mul(this.random.nextDouble());
		let j = 0;
		for (; j < propensities.length; j++) {
			remainingPropensity = remainingPropensity.sub(propensities[j]);
			if (remainingPropensity.isNeg()) {
				break;
			}
		}
		if (j == propensities.length) {
			// No reaction can fire from the current state. Still honor a request to
			// advance to the time limit: parking the clock at endTime lets a later
			// step re-evaluate time-dependent rates that may switch on and revive the
			// system at that time.
			this.parkAtEndTime(endTime, advanceToEndTime, currentTime);
			return false;
		}
		const drawnTime = this.drawTime(totalPropensity, this.random);
		const tau = typeof drawnTime === 'number' ? Decimal(drawnTime) : drawnTime;
		const nextTime = currentTime.add(tau);
		// If the drawn event would fall past the requested time limit, do not fire
		// it. The event is discarded and re-drawn on the next call, which is valid
		// for the memoryless exponential waiting time.
		if (endTime !== null && nextTime.comparedTo(endTime) > 0) {
			this.parkAtEndTime(endTime, advanceToEndTime, currentTime);
			return false;
		}
		const reaction = this.reactions[j];
		const reactionsToRemoveFromCache = new Set<number>([j]);
		// Apply the reaction's stoichiometry directly to the live vector. The change
		// vector is not stored on the step - it is implied by `reaction` and replayed
		// during reconstruction.
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			this.currentCounts[nIndex] =
				this.currentCounts[nIndex] - reaction.from[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		for (let i = 0; i < reaction.to.length; i++) {
			const n = reaction.to[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			this.currentCounts[nIndex] =
				this.currentCounts[nIndex] + reaction.to[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => this.invalidatePropensity(r));
		this.recordStep(new Step(this, this.getStepCount(), nextTime, reaction));
		return true;
	}

	/**
	 * When `advanceToEndTime` is set and the limit lies strictly in the future,
	 * append a marker step (no reaction, counts unchanged) at exactly `endTime`.
	 * This advances the clock to the time limit even though no reaction fired -
	 * whether because the drawn event overshot the limit or because the system is
	 * momentarily dead - so a subsequent step re-evaluates time-dependent rates at
	 * `endTime`. That is what lets a rate switch on at a specific time and revive
	 * an otherwise dead system, or lets an injection land at exactly that time.
	 * The guard prevents adding a duplicate or backwards-in-time marker.
	 */
	private parkAtEndTime(
		endTime: Decimal | number | null,
		advanceToEndTime: boolean,
		currentTime: Decimal
	): void {
		if (
			advanceToEndTime &&
			endTime !== null &&
			currentTime.comparedTo(endTime) < 0
		) {
			// A marker leaves the counts untouched, so it carries no delta.
			this.recordStep(
				new Step(this, this.getStepCount(), Decimal(endTime), null)
			);
		}
	}

	/**
	 * Append a produced step to the trajectory and report it to the step listener.
	 * With retention on the step is pushed onto the full log; with retention off
	 * only `[start, last]` are kept, so the new step replaces the previous last.
	 */
	private recordStep(step: Step): void {
		if (this.retainHistory) {
			this.steps.push(step);
		} else if (this.steps.length < 2) {
			// Only the start step is present so far; keep it and add this one.
			this.steps.push(step);
		} else {
			// Drop the previous last step, keeping just [start, last].
			this.steps[1] = step;
		}
		if (this.onStepListener !== null) {
			// currentCounts is exactly this step's state (mutated in place just above
			// by the fire/inject, or unchanged for a marker/start). Hand the listener
			// a copy so it gets the counts for free without walking the log, and can
			// never corrupt the live vector.
			this.onStepListener(step, this.currentCounts.slice());
		}
	}

	private calculatePropensity(
		reaction: Reaction,
		rate: Decimal,
		speciesCounts: bigint[]
	): Decimal {
		let inputsPropensity = 1n;
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i];
			const available = speciesCounts[this.nodesOrder.get(n.node)!];
			if (available >= n.amount) {
				inputsPropensity *= this.binomCoeff(available, n.amount);
			} else {
				// Early out as we don't have enough inputs
				return Decimal(0);
			}
		}
		// inputsPropensity is a bigint (a possibly very large binomial product);
		// stringify it so decimal.js keeps full precision instead of going through
		// a lossy Number conversion.
		return rate.mul(inputsPropensity.toString());
	}

	/**
	 * Drop the cached propensity of reaction `i` (if any) so it is recomputed on
	 * the next evaluation, keeping the running total propensity in sync.
	 */
	private invalidatePropensity(i: number): void {
		const previous = this.lastReactionPropensities[i];
		if (previous !== null) {
			this.lastReactionPropensities[i] = null;
			this.lastPartialTotalPropensity =
				this.lastPartialTotalPropensity.sub(previous);
		}
	}

	/**
	 * Binomial coefficient C(available, requested), the number of distinct ways
	 * to choose `requested` reactant molecules out of `available`.
	 *
	 * Space-optimized dynamic programming: build successive rows of Pascal's
	 * triangle in a single row buffer of size `requested + 1`, using only
	 * additions. O(available * requested) time, O(requested) space, exact result,
	 * and never materializes the full factorial of the (potentially very large)
	 * reactant count.
	 * @see https://www.geeksforgeeks.org/dsa/binomial-coefficient-dp-9/
	 */
	private binomCoeff(available: bigint, requested: bigint): bigint {
		const n = Number(available);
		const k = Number(requested);
		const row: bigint[] = new Array(k + 1).fill(0n);
		row[0] = 1n; // C(i, 0) = 1
		for (let i = 1; i <= n; i++) {
			// Update the current row right-to-left so each C[j] still reads the
			// previous row's C[j-1]. Only the first min(i, k) entries change.
			const upper = i < k ? i : k;
			for (let j = upper; j > 0; j--) {
				row[j] = row[j] + row[j - 1];
			}
		}
		return row[k];
	}

	public getNodes(): Node[] {
		return [...this.nodes];
	}

	public getReactions(): Reaction[] {
		return [...this.reactions];
	}

	/**
	 * The retained steps. With history retention on this is the whole trajectory;
	 * with it off it is only `[start, last]` (use {@link getStepCount} for the
	 * true number of steps produced and {@link StepListener} to see them all).
	 */
	public getSteps(): Step[] {
		return [...this.steps];
	}

	public getStartStep(): Step {
		return this.steps[0];
	}

	public getLastStep(): Step {
		return this.steps[this.steps.length - 1];
	}

	/** Total number of steps produced so far, including the start step. */
	public getStepCount(): number {
		// The last step (always retained) sits at absolute index count - 1, so its
		// index is the single source of truth for how many steps have been produced.
		return this.getLastStep().index + 1;
	}

	/**
	 * Reconstruct the full species-count vector at the given absolute step index
	 * by replaying the event log forward from the start snapshot.
	 *
	 * The start step and the current last step are O(species); an interior step is
	 * O(index) as it replays the log from the start. This is a point-query helper -
	 * for dense output prefer {@link forEachStep}, which walks the whole trajectory
	 * once with a single buffer (scanning via this method is O(steps^2)).
	 *
	 * With history retention off only the start and last steps are available;
	 * requesting any interior step throws.
	 */
	public getCountsAt(index: number): bigint[] {
		const count = this.getStepCount();
		if (index < 0 || index >= count) {
			throw new RangeError(`Step index ${index} out of range [0, ${count})`);
		}
		if (index === 0) {
			return this.startCounts.slice();
		}
		if (index === count - 1) {
			// The live vector already is the last step's state.
			return this.currentCounts.slice();
		}
		if (!this.retainHistory) {
			throw new Error(
				'Cannot reconstruct an interior step with history retention off; ' +
					'only the start and last steps are available. Call getSpeciesCounts() ' +
					'synchronously inside an onStep listener instead.'
			);
		}
		const counts = this.startCounts.slice();
		for (let k = 1; k <= index; k++) {
			this.applyStepDelta(counts, k);
		}
		return counts;
	}

	/** Reconstruct the count of a single node at the given absolute step index. */
	public getCountAt(index: number, node: Node): bigint {
		const order = this.nodesOrder.get(node);
		if (order === undefined) {
			throw new Error(`Unknown node ${node.name}`);
		}
		return this.getCountsAt(index)[order];
	}

	/**
	 * Walk the whole trajectory once, invoking `callback` with the running count
	 * vector at each step. This is the efficient path for dense output (plotting,
	 * export): O(steps * changes-per-step) time and O(species) working memory, with
	 * no per-step allocation.
	 *
	 * The `counts` argument is a live buffer reused across calls - do not retain a
	 * reference to it; copy (e.g. `counts.slice()`) if you need to keep a snapshot.
	 *
	 * Requires history retention. With `retainHistory: false` the full trajectory
	 * is never in memory (only the start and last steps are), so this throws rather
	 * than silently visiting just those two - stream the trajectory via the
	 * {@link StepListener} instead, and reach the endpoints through
	 * {@link getStartStep} / {@link getLastStep}.
	 */
	public forEachStep(
		callback: (
			time: Decimal,
			counts: bigint[],
			reaction: Reaction | null,
			index: number
		) => void
	): void {
		if (!this.retainHistory) {
			throw new Error(
				'forEachStep requires history retention. With retainHistory:false the ' +
					'full trajectory is not kept - stream it via the onStep listener, or ' +
					'read the endpoints with getStartStep()/getLastStep().'
			);
		}
		const counts = this.startCounts.slice();
		for (let i = 0; i < this.steps.length; i++) {
			if (i > 0) {
				this.applyStepDelta(counts, i);
			}
			callback(this.steps[i].time, counts, this.steps[i].reaction, i);
		}
	}

	/**
	 * Apply the count change of the retained step at array index `k` to `counts`.
	 * A reaction step replays its stoichiometry; an injection step replays its
	 * stored delta; a marker step changes nothing. Only valid with retention on,
	 * where the array index equals the absolute step index.
	 */
	private applyStepDelta(counts: bigint[], k: number): void {
		const step = this.steps[k];
		const reaction = step.reaction;
		if (reaction !== null) {
			for (let i = 0; i < reaction.from.length; i++) {
				const idx = this.nodesOrder.get(reaction.from[i].node)!;
				counts[idx] = counts[idx] - reaction.from[i].amount;
			}
			for (let i = 0; i < reaction.to.length; i++) {
				const idx = this.nodesOrder.get(reaction.to[i].node)!;
				counts[idx] = counts[idx] + reaction.to[i].amount;
			}
			return;
		}
		const delta = this.stepDeltas.get(k);
		if (delta !== undefined) {
			for (let i = 0; i < delta.length; i++) {
				counts[delta[i][0]] = counts[delta[i][0]] + delta[i][1];
			}
		}
	}

	public inject(nodeValues: NodeWithQuantity[], time: Decimal | null): void {
		const currentStep = this.getLastStep();
		// Guard against traveling back in time, which would corrupt the ordered
		// trajectory. Checked before any mutation so a rejected inject is a no-op.
		if (time !== null && time.comparedTo(currentStep.time) < 0) {
			throw (
				'Cannot inject at time ' +
				time.toString() +
				' which is before the last step time ' +
				currentStep.time.toString()
			);
		}
		const delta: [number, bigint][] = [];
		const reactionsToRemoveFromCache = new Set<number>();
		for (let i = 0; i < nodeValues.length; i++) {
			const nIndex = this.nodesOrder.get(nodeValues[i].node)!;
			this.currentCounts[nIndex] =
				this.currentCounts[nIndex] + nodeValues[i].amount;
			// An injection's change is not implied by a reaction, so record it as an
			// explicit delta for reconstruction (only needed while history is kept).
			delta.push([nIndex, nodeValues[i].amount]);
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(nodeValues[i].node)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => this.invalidatePropensity(r));
		const index = this.getStepCount();
		if (this.retainHistory) {
			this.stepDeltas.set(index, delta);
		}
		this.recordStep(new Step(this, index, time ?? currentStep.time, null));
	}

	public getMaxTime(): Decimal {
		return this.steps.length === 0
			? Decimal(0)
			: this.steps[this.steps.length - 1].time;
	}
}

export class Step {
	/** The simulation time at this step. */
	public readonly time: Decimal;
	/**
	 * The reaction that fired to generate this step or null
	 * for the start step, marker steps or if node quantities have been injected.
	 */
	public readonly reaction: Reaction | null;
	/** Absolute position of this step in the trajectory (0 is the start step). */
	public readonly index: number;
	private readonly simulator: GillespieSimulator;

	constructor(
		simulator: GillespieSimulator,
		index: number,
		time: Decimal,
		reaction: Reaction | null
	) {
		this.simulator = simulator;
		this.index = index;
		this.time = time;
		this.reaction = reaction;
	}

	/**
	 * Reconstruct the full species-count vector at this step from the simulator's
	 * event log (see {@link GillespieSimulator.getCountsAt}). This is a computation,
	 * not a stored field: each call returns a fresh array. The start and last steps
	 * are O(species); an interior step is O(index). To read counts across the whole
	 * trajectory use {@link GillespieSimulator.forEachStep} rather than calling this
	 * per step, which would be O(steps^2).
	 *
	 * With history retention off, only the start and last steps can be
	 * reconstructed - calling this on an interior step throws. Inside an
	 * {@link StepListener} you are already handed the counts, so there is no need
	 * to call this.
	 */
	public getSpeciesCounts(): bigint[] {
		return this.simulator.getCountsAt(this.index);
	}

	/**
	 * Reconstruct the count of a single `node` at this step (see
	 * {@link GillespieSimulator.getCountAt}). Same cost and retention rules as
	 * {@link getSpeciesCounts}; prefer this when you only need one species.
	 */
	public getSpeciesCount(node: Node): bigint {
		return this.simulator.getCountAt(this.index, node);
	}
}
