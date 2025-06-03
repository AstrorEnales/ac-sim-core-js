import {ConflictHandling} from './ConflictHandling';
import {Parameter} from './Parameter';

export abstract class Place {
	private static ID_COUNTER = 0;
	public readonly id: number = ++Place.ID_COUNTER;
	public conflictStrategy: ConflictHandling = ConflictHandling.Probability;
	public readonly parameters: Parameter[] = [];
	public readonly name: string;
	public isConstant: boolean = false;

	constructor(name: string) {
		this.name = name;
	}

	public toString(): string {
		return this.name;
	}
}
