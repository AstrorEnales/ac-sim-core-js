import { default as Decimal } from 'decimal.js';
export declare class Parameter {
    private readonly _name;
    private _value;
    constructor(name: string, value: Decimal);
    get name(): string;
    get value(): Decimal;
    set value(value: Decimal);
}
