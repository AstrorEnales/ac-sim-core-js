import Decimal from 'decimal.js';

export class Parameter {
	private readonly _name: string;
	private _value: Decimal = Decimal(0);

	constructor(name: string, value: Decimal) {
		this._name = name;
		this._value = value;
	}

	public get name(): string {
		return this._name;
	}

	public get value(): Decimal {
		return this._value;
	}

	public set value(value: Decimal) {
		this._value = value;
	}
}
