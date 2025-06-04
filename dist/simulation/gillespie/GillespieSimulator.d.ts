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
    constructor(nodes: Node[], reactions: Reaction[], random?: RandomGenerator);
    private initialize;
    step(endTime?: Decimal | number | null): boolean;
    private calculatePropensity;
    private calculateReactantCombinatorialCoefficient;
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
    constructor(time: Decimal, speciesCounts: bigint[]);
}
