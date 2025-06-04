import { ConflictHandling } from './ConflictHandling';
import { Parameter } from './Parameter';
export declare abstract class Place {
    private static ID_COUNTER;
    readonly id: number;
    conflictStrategy: ConflictHandling;
    readonly parameters: Parameter[];
    readonly name: string;
    isConstant: boolean;
    constructor(name: string);
    toString(): string;
}
