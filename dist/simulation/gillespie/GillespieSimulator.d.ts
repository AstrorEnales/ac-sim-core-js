import { default as Decimal } from 'decimal.js';
import { Node } from '../../model/gillespie/Node';
import { Reaction } from '../../model/gillespie/Reaction';
import { RandomGenerator } from '../../random/RandomGenerator';
import { Simulator } from '../Simulator';
import { NodeWithQuantity } from '../../model/gillespie';
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
export type TimeDraw = (totalPropensity: Decimal, random: RandomGenerator) => Decimal | number;
/**
 * Default {@link TimeDraw}: an exponentially distributed waiting time with rate
 * equal to the total propensity, sampled by inverse transform as
 * `ln(1 / r) / totalPropensity` with `r` uniform in `[0, 1)`.
 */
export declare const exponentialTimeDraw: TimeDraw;
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
export declare class GillespieSimulator extends Simulator {
    private readonly nodes;
    private readonly nodesOrder;
    private readonly reactions;
    /**
     * The retained event log. With retention on this holds every step and its
     * array index equals the step's absolute {@link Step.index}. With retention
     * off it holds only `[start, last]`.
     */
    private readonly steps;
    private readonly lastReactionPropensities;
    private readonly nodeToReactionsMap;
    private lastPartialTotalPropensity;
    /**
     * The rate currently in effect for each reaction. For fixed rates this is
     * the constant; for dynamic (callback) rates it is the value returned by the
     * most recent callback call, or `null` before the callback has ever run.
     */
    private readonly currentRates;
    /**
     * Whether each reaction's rate still needs to be resolved via its callback.
     * Fixed rates start `false`; a callback rate starts `true` and flips to
     * `false` once the callback opts into caching (see {@link RateResult.cache}).
     */
    private readonly rateIsDynamic;
    /** Strategy for drawing the waiting time until the next reaction. */
    private readonly drawTime;
    /**
     * The live species-count vector, mutated in place on every fire/injection.
     * This is the single source of truth for the current state - propensity
     * evaluation reads it and reconstruction of any past step replays the event
     * log forward from {@link startCounts}. Keeping one vector (instead of a full
     * copy per step) is what turns the memory cost from O(steps * species) into
     * O(steps) + O(species).
     */
    private currentCounts;
    /** Snapshot of the counts at the start step - the reconstruction anchor. */
    private startCounts;
    /** Explicit deltas for injection steps, keyed by absolute step index. */
    private readonly stepDeltas;
    /** See {@link GillespieOptions.retainHistory}. Fixed at construction. */
    private readonly retainHistory;
    /** See {@link GillespieOptions.onStep}. Fixed at construction. */
    private readonly onStepListener;
    constructor(nodes: Node[], reactions: Reaction[], random?: RandomGenerator, drawTime?: TimeDraw, options?: GillespieOptions);
    private initialize;
    addReaction(reaction: Reaction): void;
    addNode(node: Node): void;
    step(endTime?: Decimal | number | null, advanceToEndTime?: boolean): boolean;
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
    private parkAtEndTime;
    /**
     * Append a produced step to the trajectory and report it to the step listener.
     * With retention on the step is pushed onto the full log; with retention off
     * only `[start, last]` are kept, so the new step replaces the previous last.
     */
    private recordStep;
    private calculatePropensity;
    /**
     * Drop the cached propensity of reaction `i` (if any) so it is recomputed on
     * the next evaluation, keeping the running total propensity in sync.
     */
    private invalidatePropensity;
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
    private binomCoeff;
    getNodes(): Node[];
    getReactions(): Reaction[];
    /**
     * The retained steps. With history retention on this is the whole trajectory;
     * with it off it is only `[start, last]` (use {@link getStepCount} for the
     * true number of steps produced and {@link StepListener} to see them all).
     */
    getSteps(): Step[];
    getStartStep(): Step;
    getLastStep(): Step;
    /** Total number of steps produced so far, including the start step. */
    getStepCount(): number;
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
    getCountsAt(index: number): bigint[];
    /** Reconstruct the count of a single node at the given absolute step index. */
    getCountAt(index: number, node: Node): bigint;
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
    forEachStep(callback: (time: Decimal, counts: bigint[], reaction: Reaction | null, index: number) => void): void;
    /**
     * Apply the count change of the retained step at array index `k` to `counts`.
     * A reaction step replays its stoichiometry; an injection step replays its
     * stored delta; a marker step changes nothing. Only valid with retention on,
     * where the array index equals the absolute step index.
     */
    private applyStepDelta;
    inject(nodeValues: NodeWithQuantity[], time: Decimal | null): void;
    getMaxTime(): Decimal;
}
export declare class Step {
    /** The simulation time at this step. */
    readonly time: Decimal;
    /**
     * The reaction that fired to generate this step or null
     * for the start step, marker steps or if node quantities have been injected.
     */
    readonly reaction: Reaction | null;
    /** Absolute position of this step in the trajectory (0 is the start step). */
    readonly index: number;
    private readonly simulator;
    constructor(simulator: GillespieSimulator, index: number, time: Decimal, reaction: Reaction | null);
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
    getSpeciesCounts(): bigint[];
    /**
     * Reconstruct the count of a single `node` at this step (see
     * {@link GillespieSimulator.getCountAt}). Same cost and retention rules as
     * {@link getSpeciesCounts}; prefer this when you only need one species.
     */
    getSpeciesCount(node: Node): bigint;
}
