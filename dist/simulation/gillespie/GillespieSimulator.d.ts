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
export declare class GillespieSimulator extends Simulator {
    private readonly nodes;
    private readonly nodesOrder;
    private readonly reactions;
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
    constructor(nodes: Node[], reactions: Reaction[], random?: RandomGenerator, drawTime?: TimeDraw);
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
    getSteps(): Step[];
    getStartStep(): Step;
    getLastStep(): Step;
    inject(nodeValues: NodeWithQuantity[], time: Decimal | null): void;
    getMaxTime(): Decimal;
}
export declare class Step {
    readonly time: Decimal;
    readonly speciesCounts: bigint[];
    /**
     * The reaction that fired to generate this step or null
     * for the start step or if node quantities have been injected.
     */
    readonly reaction: Reaction | null;
    constructor(time: Decimal, speciesCounts: bigint[], reaction: Reaction | null);
}
