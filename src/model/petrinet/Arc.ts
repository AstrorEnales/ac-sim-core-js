import {ArcType} from './ArcType';
import {Parameter} from './Parameter';
import {Place} from './Place';
import {Transition} from './Transition';

export class Arc {
	private static ID_COUNTER = 0;
	public readonly id: number = ++Arc.ID_COUNTER;
	private _priority: number = 1;
	private _probability: number = 1.0;
	public function: string;
	public readonly parameters: Parameter[] = [];
	public readonly from: Place | Transition;
	public readonly to: Place | Transition;
	public readonly type: ArcType;

	constructor(
		type: ArcType,
		connection: {from: Place; to: Transition} | {from: Transition; to: Place},
		f: string = '1'
	) {
		this.type = type;
		this.from = connection.from;
		this.to = connection.to;
		this.function = f.trim().length === 0 ? '1' : f.trim();
	}

	public get priority(): number {
		return this._priority;
	}

	public set priority(value: number) {
		this._priority = Math.max(1, Math.floor(value));
	}

	public get probability(): number {
		return this._probability;
	}

	public set probability(value: number) {
		this._probability = Math.max(0, Math.min(1, value));
	}
}
