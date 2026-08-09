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

export class GillespieSimulator extends Simulator {
	private readonly nodes: Node[];
	private readonly nodesOrder = new Map<Node, number>();
	private readonly reactions: Reaction[];
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

	constructor(
		nodes: Node[],
		reactions: Reaction[],
		random: RandomGenerator = new Xorshift128Plus(42n),
		drawTime: TimeDraw = exponentialTimeDraw
	) {
		super(random);
		this.drawTime = drawTime;
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
		this.steps.splice(0, this.steps.length);
		const speciesCounts: bigint[] = this.nodes.map((n) => n.startCount);
		this.steps.push(new Step(startTime, speciesCounts, null));
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
			this.steps.forEach((s) => s.speciesCounts.push(0n));
		}
	}

	public step(
		endTime: Decimal | number | null = null,
		advanceToEndTime = false
	): boolean {
		const currentStep = this.steps[this.steps.length - 1];
		const count = (node: Node): bigint =>
			currentStep.speciesCounts[this.nodesOrder.get(node)!];
		const propensities = this.reactions.map((r, i) => {
			// Resolve dynamic rates. Fixed rates, and callbacks that opted into
			// caching, keep their frozen value and skip the callback entirely.
			if (this.rateIsDynamic[i] && isRateCallback(r.rate)) {
				const result = r.rate({reaction: r, time: currentStep.time, count});
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
					currentStep.speciesCounts
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
			this.parkAtEndTime(endTime, advanceToEndTime, currentStep);
			return false;
		}
		const drawnTime = this.drawTime(totalPropensity, this.random);
		const tau = typeof drawnTime === 'number' ? Decimal(drawnTime) : drawnTime;
		const nextTime = currentStep.time.add(tau);
		// If the drawn event would fall past the requested time limit, do not fire
		// it. The event is discarded and re-drawn on the next call, which is valid
		// for the memoryless exponential waiting time.
		if (endTime !== null && nextTime.comparedTo(endTime) > 0) {
			this.parkAtEndTime(endTime, advanceToEndTime, currentStep);
			return false;
		}
		const newSpeciesCounts: bigint[] = [...currentStep.speciesCounts];
		const reaction = this.reactions[j];
		const reactionsToRemoveFromCache = new Set<number>([j]);
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] - reaction.from[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		for (let i = 0; i < reaction.to.length; i++) {
			const n = reaction.to[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + reaction.to[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => this.invalidatePropensity(r));
		const nextStep = new Step(nextTime, newSpeciesCounts, reaction);
		this.steps.push(nextStep);
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
		currentStep: Step
	): void {
		if (
			advanceToEndTime &&
			endTime !== null &&
			currentStep.time.comparedTo(endTime) < 0
		) {
			this.steps.push(
				new Step(Decimal(endTime), [...currentStep.speciesCounts], null)
			);
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

	public getSteps(): Step[] {
		return [...this.steps];
	}

	public getStartStep(): Step {
		return this.steps[0];
	}

	public getLastStep(): Step {
		return this.steps[this.steps.length - 1];
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
		const newSpeciesCounts: bigint[] = [...currentStep.speciesCounts];
		const reactionsToRemoveFromCache = new Set<number>();
		for (let i = 0; i < nodeValues.length; i++) {
			const nIndex = this.nodesOrder.get(nodeValues[i].node)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + nodeValues[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(nodeValues[i].node)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => this.invalidatePropensity(r));
		const nextStep = new Step(time ?? currentStep.time, newSpeciesCounts, null);
		this.steps.push(nextStep);
	}

	public getMaxTime(): Decimal {
		return this.steps.length === 0
			? Decimal(0)
			: this.steps[this.steps.length - 1].time;
	}
}

export class Step {
	public readonly time: Decimal;
	public readonly speciesCounts: bigint[];
	/**
	 * The reaction that fired to generate this step or null
	 * for the start step or if node quantities have been injected.
	 */
	public readonly reaction: Reaction | null;

	constructor(
		time: Decimal,
		speciesCounts: bigint[],
		reaction: Reaction | null
	) {
		this.time = time;
		this.speciesCounts = speciesCounts;
		this.reaction = reaction;
	}
}
