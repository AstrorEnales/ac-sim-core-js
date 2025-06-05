import Decimal from 'decimal.js';
import {Node} from '../../model/gillespie/Node';
import {Reaction} from '../../model/gillespie/Reaction';
import {RandomGenerator} from '../../random/RandomGenerator';
import {Xorshift128Plus} from '../../random/Xorshift128Plus';
import {Simulator} from '../Simulator';
import {NodeWithQuantity} from '../../model/gillespie';

export class GillespieSimulator extends Simulator {
	private readonly nodes: Node[];
	private readonly nodesOrder = new Map<Node, number>();
	private readonly reactions: Reaction[];
	private readonly reactionsOrder = new Map<Reaction, number>();
	private readonly steps: Step[] = [];
	private readonly lastReactionPropensities = new Map<Reaction, Decimal>();
	private readonly nodeToReactionsMap = new Map<Node, Reaction[]>();
	private lastPartialTotalPropensity: Decimal | null = null;

	constructor(
		nodes: Node[],
		reactions: Reaction[],
		random: RandomGenerator = new Xorshift128Plus(42n)
	) {
		super(random);
		this.nodes = nodes;
		this.nodes.forEach((n, i) => this.nodesOrder.set(n, i));
		this.reactions = reactions;
		this.reactions.forEach((r, i) => this.reactionsOrder.set(r, i));
		this.nodes.forEach((n) => this.nodeToReactionsMap.set(n, []));
		this.reactions.forEach((r) => {
			r.from.forEach((n) => this.nodeToReactionsMap.get(n.node)!.push(r));
		});
		this.initialize(Decimal(0));
	}

	private initialize(startTime: Decimal): void {
		this.steps.splice(0, this.steps.length);
		const speciesCounts: bigint[] = this.nodes.map((n) => n.startCount);
		this.steps.push(new Step(startTime, speciesCounts));
	}

	public step(endTime: Decimal | number | null = null): boolean {
		const currentStep = this.steps[this.steps.length - 1];
		if (this.lastPartialTotalPropensity === null) {
			this.lastPartialTotalPropensity = Decimal(0);
		}
		const propensities = this.reactions.map((r) => {
			let p = this.lastReactionPropensities.get(r);
			if (p === undefined) {
				p = this.calculatePropensity(r, currentStep.speciesCounts);
				this.lastPartialTotalPropensity =
					this.lastPartialTotalPropensity!.add(p);
				this.lastReactionPropensities.set(r, p);
			}
			return p;
		});
		const totalPropensity = this.lastPartialTotalPropensity;
		const r1 = this.random.nextDouble();
		const tau = Decimal.div(Decimal.log10(Decimal.div(1, r1)), totalPropensity);
		let r2TotalPropensity = totalPropensity.mul(this.random.nextDouble());
		let j = 0;
		for (; j < propensities.length; j++) {
			r2TotalPropensity = r2TotalPropensity.sub(propensities[j]);
			if (r2TotalPropensity.isNeg()) {
				break;
			}
		}
		if (j == propensities.length) {
			return false; // dead
		}
		const newSpeciesCounts: bigint[] = [...currentStep.speciesCounts];
		const reaction = this.reactions[j];
		const reactionsToRemoveFromCache = new Set<Reaction>([reaction]);
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] - reaction.from[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap.get(n)!.forEach((r) => {
				this.lastReactionPropensities.delete(r);
				reactionsToRemoveFromCache.add(r);
			});
		}
		for (let i = 0; i < reaction.to.length; i++) {
			const n = reaction.to[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + reaction.to[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap.get(n)!.forEach((r) => {
				this.lastReactionPropensities.delete(r);
				reactionsToRemoveFromCache.add(r);
			});
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => {
			this.lastPartialTotalPropensity = this.lastPartialTotalPropensity!.sub(
				propensities[this.reactionsOrder.get(r)!]
			);
		});
		const nextTime = currentStep.time.add(tau);
		if (endTime !== null && nextTime.comparedTo(endTime) > 0) {
			return false;
		}
		const nextStep = new Step(nextTime, newSpeciesCounts);
		this.steps.push(nextStep);
		return true;
	}

	private calculatePropensity(
		reaction: Reaction,
		speciesCounts: bigint[]
	): Decimal {
		const inputsPropensity = reaction.from
			.map<bigint>((n) =>
				speciesCounts[this.nodesOrder.get(n.node)!] >= n.amount
					? this.calculateReactantCombinatorialCoefficient(
							n.amount,
							speciesCounts[this.nodesOrder.get(n.node)!]
						)
					: 0n
			)
			.reduce((acc, v) => acc * v, 1n);
		return reaction.rate.mul(Decimal(inputsPropensity.toString()));
	}

	private calculateReactantCombinatorialCoefficient(
		requested: bigint,
		available: bigint
	): bigint {
		return (
			this.factorial(available) /
			(this.factorial(requested) * this.factorial(available - requested))
		);
	}

	private factorial(n: bigint): bigint {
		let result = 1n;
		for (let i = 2n; i <= n; i++) {
			result *= i;
		}
		return result;
	}

	public getNodes(): Node[] {
		return [...this.nodes];
	}

	public getReactions(): Reaction[] {
		return [...this.reactions];
	}

	public getSteps(): Step[] {
		return [...this.steps];
	}

	public getStartStep(): Step {
		return this.steps[0];
	}

	public getLastStep(): Step {
		return this.steps[this.steps.length - 1];
	}

	public inject(nodeValues: NodeWithQuantity[], time: Decimal | null): void {
		const currentStep = this.getLastStep();
		const newSpeciesCounts: bigint[] = [...currentStep.speciesCounts];
		for (let i = 0; i < nodeValues.length; i++) {
			const nIndex = this.nodesOrder.get(nodeValues[i].node)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + nodeValues[i].amount;
		}
		const nextStep = new Step(time ?? currentStep.time, newSpeciesCounts);
		this.steps.push(nextStep);
	}

	public getMaxTime(): Decimal {
		return this.steps[this.steps.length - 1].time;
	}
}

export class Step {
	public readonly time: Decimal;
	public readonly speciesCounts: bigint[];

	constructor(time: Decimal, speciesCounts: bigint[]) {
		this.time = time;
		this.speciesCounts = speciesCounts;
	}
}
