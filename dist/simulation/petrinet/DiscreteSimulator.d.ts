import { default as Decimal } from 'decimal.js';
import { Simulator } from '../Simulator';
import { Transition } from '../../model/petrinet/Transition';
import { Place } from '../../model/petrinet/Place';
import { Arc } from '../../model/petrinet/Arc';
import { RandomGenerator } from '../../random/RandomGenerator';
import { DiscretePlace } from '../../model/petrinet/DiscretePlace';
import { StochasticSampler } from '../../sampler/StochasticSampler';
import { Parameter } from '../../model/petrinet/Parameter';
/**
 * Simulator for extended, timed, functional, stochastic, discrete Petri Nets with capacities.
 */
export declare class DiscreteSimulator extends Simulator {
    private readonly places;
    private readonly placesOrder;
    private readonly transitions;
    private readonly arcTransitions;
    private readonly arcPlaces;
    private readonly markings;
    private readonly openMarkings;
    private readonly firingEdges;
    private readonly outEdges;
    private readonly inEdges;
    constructor(nodes: (Transition | Place)[], arcs: Arc[], random?: RandomGenerator);
    private initialize;
    private determineConcession;
    step(endTime?: Decimal | number | null): boolean;
    private resolvePlaceOutputConflict;
    private resolvePlaceInputConflict;
    private fireTransitions;
    getMaxTime(): Decimal;
    getStartMarking(): Marking;
    getMarkingTimeline(): Marking[];
    getTokens(marking: Marking, place: DiscretePlace): bigint;
    get isDead(): boolean;
    getEdges(): FiringEdge[];
    getMarkings(): Marking[];
    evaluateFunction(placeTokens: bigint[], arc: Arc): bigint;
    static createExpressionScope(placesOrder: Map<DiscretePlace, number>, placeTokens: bigint[], parameters: Parameter[]): {
        [key: string]: Decimal | bigint;
    };
    static evaluateExpression(placesOrder: Map<DiscretePlace, number>, placeTokens: bigint[], f: string, parameters: Parameter[]): any;
}
declare class Concession {
    readonly transition: TransitionDetails;
    readonly delay: Decimal;
    readonly fixedArcWeights: Map<Arc, bigint>;
    readonly retained: boolean;
    constructor(transition: TransitionDetails, delay: Decimal, retained?: boolean);
    retain(elapsedDelay: Decimal): Concession;
    toString(): string;
}
declare class TransitionDetails {
    readonly transition: Transition;
    readonly sources: Arc[];
    readonly targets: Arc[];
    readonly firingCondition: string;
    fixedDelay: Decimal | null;
    delayFunction: string | null;
    delaySampler: StochasticSampler | null;
    constructor(transition: Transition, random: RandomGenerator);
    getDelay(placesOrder: Map<DiscretePlace, number>, placeTokens: bigint[]): Decimal;
}
export declare class FiringEdge {
    readonly from: Marking;
    readonly to: Marking;
    readonly transitions: TransitionDetails[];
    constructor(from: Marking, to: Marking, transitions: TransitionDetails[]);
    fires(transition: Transition): boolean;
}
export declare class Marking {
    readonly time: Decimal;
    readonly placeTokens: bigint[];
    readonly concessionsOrderedByDelay: Concession[];
    constructor(time: Decimal, placeTokens: bigint[], concessionsOrderedByDelay: Concession[]);
    get isDead(): boolean;
    getConcession(transition: Transition): Concession | null;
}
export {};
