import * as math from 'mathjs';
import {Place} from './Place';

export class DiscretePlace extends Place {
	private _tokenStart: bigint = 0n;
	private _tokenMin: bigint = 0n;
	private _tokenMax: bigint | null = null;

	public get tokenStart(): bigint {
		return this._tokenStart;
	}

	public set tokenStart(value: bigint) {
		this._tokenStart = math.max(value, 0n);
	}

	public get tokenMin(): bigint {
		return this._tokenMin;
	}

	public set tokenMin(value: bigint) {
		this._tokenMin = math.max(value, 0n);
	}

	public get tokenMax(): bigint | null {
		return this._tokenMax;
	}

	public set tokenMax(value: bigint | null) {
		this._tokenMax = value !== null ? math.max(value, 0n) : null;
	}
}
