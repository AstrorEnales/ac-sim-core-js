import {Parameter} from './Parameter';

export abstract class Transition {
	private static ID_COUNTER = 0;
	public readonly id: number = ++Transition.ID_COUNTER;
	public firingCondition: string = 'true';
	public knockedOut: boolean = false;
	public readonly parameters: Parameter[] = [];
	public readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	public toString(): string {
		return this.name;
	}
}
