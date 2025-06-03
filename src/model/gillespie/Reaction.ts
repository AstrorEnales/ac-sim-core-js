import Decimal from 'decimal.js';
import {NodeWithQuantity} from './NodeWithQuantity';

export class Reaction {
	private static ID_COUNTER = 0;
	public readonly id: number = ++Reaction.ID_COUNTER;
	public readonly name: string;
	public readonly from: NodeWithQuantity[];
	public readonly to: NodeWithQuantity[];
	public readonly rate: Decimal;

	constructor(
		name: string,
		from: NodeWithQuantity[],
		to: NodeWithQuantity[],
		rate: Decimal = Decimal(1)
	) {
		this.name = name;
		this.from = from;
		this.to = to;
		this.rate = rate;
	}
}
