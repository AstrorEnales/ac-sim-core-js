import { default as Decimal } from 'decimal.js';
import { Node } from '../../model/gillespie/Node';
import { Reaction } from '../../model/gillespie/Reaction';
import { RandomGenerator } from '../../random/RandomGenerator';
import { Simulator } from '../Simulator';
import { NodeWithQuantity } from '../../model/gillespie';
export declare class GillespieSimulator extends Simulator {
    private readonly nodes;
    private readonly nodesOrder;
    private readonly reactions;
    private readonly steps;
    private readonly lastReactionPropensities;
    private readonly nodeToReactionsMap;
    private lastPartialTotalPropensity;
    constructor(nodes: Node[], reactions: Reaction[], random?: RandomGenerator);
    private initialize;
    addReaction(reaction: Reaction): void;
    addNode(node: Node): void;
    step(endTime?: Decimal | number | null): boolean;
    private calculatePropensity;
    /**
     * Binomial coefficient C(available, requested), the number of distinct ways
     * to choose `requested` reactant molecules out of `available`.
     *
     * Space-optimised dynamic programming: build successive rows of Pascal's
     * triangle in a single row buffer of size `requested + 1`, using only
     * additions. O(available * requested) time, O(requested) space, exact result,
     * and never materialises the full factorial of the (potentially very large)
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
