import { Parameter } from './Parameter';
export declare abstract class Transition {
    private static ID_COUNTER;
    readonly id: number;
    firingCondition: string;
    knockedOut: boolean;
    readonly parameters: Parameter[];
    readonly name: string;
    constructor(name: string);
    toString(): string;
}
