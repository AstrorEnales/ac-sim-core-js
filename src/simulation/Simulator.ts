import {create, all, MathJsInstance} from 'mathjs';
import {RandomGenerator} from '../random/RandomGenerator';

export abstract class Simulator {
	protected readonly random: RandomGenerator;
	protected mathjs: MathJsInstance;

	protected constructor(
		random: RandomGenerator,
		mathjs: MathJsInstance | null = null
	) {
		this.random = random;
		this.mathjs =
			mathjs ??
			create(all, {
				number: 'BigNumber',
				precision: 64,
				predictable: true,
			});
	}
}
