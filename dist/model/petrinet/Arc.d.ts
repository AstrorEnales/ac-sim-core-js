import { ArcType } from './ArcType';
import { Parameter } from './Parameter';
import { Place } from './Place';
import { Transition } from './Transition';
export declare class Arc {
    private static ID_COUNTER;
    readonly id: number;
    private _priority;
    private _probability;
    function: string;
    readonly parameters: Parameter[];
    readonly from: Place | Transition;
    readonly to: Place | Transition;
    readonly type: ArcType;
    constructor(type: ArcType, connection: {
        from: Place;
        to: Transition;
    } | {
        from: Transition;
        to: Place;
    }, f?: string);
    get priority(): number;
    set priority(value: number);
    get probability(): number;
    set probability(value: number);
}
