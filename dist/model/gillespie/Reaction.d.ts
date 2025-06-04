import { default as Decimal } from 'decimal.js';
import { NodeWithQuantity } from './NodeWithQuantity';
export declare class Reaction {
    private static ID_COUNTER;
    readonly id: number;
    readonly name: string;
    readonly from: NodeWithQuantity[];
    readonly to: NodeWithQuantity[];
    readonly rate: Decimal;
    constructor(name: string, from: NodeWithQuantity[], to: NodeWithQuantity[], rate?: Decimal);
}
