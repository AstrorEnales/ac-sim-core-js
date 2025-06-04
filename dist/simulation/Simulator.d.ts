import { MathJsInstance } from 'mathjs';
import { RandomGenerator } from '../random/RandomGenerator';
export declare abstract class Simulator {
    protected readonly random: RandomGenerator;
    protected mathjs: MathJsInstance;
    protected constructor(random: RandomGenerator, mathjs?: MathJsInstance | null);
}
