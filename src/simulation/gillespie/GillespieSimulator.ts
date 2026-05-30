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
	private readonly steps: Step[] = [];
	private readonly lastReactionPropensities: (Decimal | null)[];
	private readonly nodeToReactionsMap = new Map<Node, Set<number>>();
	private lastPartialTotalPropensity = Decimal(0);
	private readonly approximateFactorialsFrom: bigint | null;

	constructor(
		nodes: Node[],
		reactions: Reaction[],
		random: RandomGenerator = new Xorshift128Plus(42n),
		approximateFactorialsFrom: bigint | null = null
	) {
		super(random);
		this.nodes = nodes;
		this.nodes.forEach((n, i) => this.nodesOrder.set(n, i));
		this.reactions = reactions;
		this.lastReactionPropensities = new Array(reactions.length).fill(null);
		this.nodes.forEach((n) => this.nodeToReactionsMap.set(n, new Set()));
		this.reactions.forEach((r, i) => {
			r.from.forEach((n) => this.nodeToReactionsMap.get(n.node)!.add(i));
		});
		this.approximateFactorialsFrom = approximateFactorialsFrom;
		this.initialize(Decimal(0));
	}

	private initialize(startTime: Decimal): void {
		this.steps.splice(0, this.steps.length);
		const speciesCounts: bigint[] = this.nodes.map((n) => n.startCount);
		this.steps.push(new Step(startTime, speciesCounts, null));
	}

	public addReaction(reaction: Reaction) {
		if (!this.reactions.includes(reaction)) {
			const reactionIndex = this.reactions.length;
			reaction.from.forEach((n) => {
				this.addNode(n.node);
				this.nodeToReactionsMap.get(n.node)!.add(reactionIndex);
			});
			reaction.to.forEach((n) => this.addNode(n.node));
			this.reactions.push(reaction);
			this.lastReactionPropensities.push(null);
		}
	}

	public addNode(node: Node) {
		if (!this.nodesOrder.has(node)) {
			this.nodesOrder.set(node, this.nodes.length);
			this.nodes.push(node);
			this.nodeToReactionsMap.set(node, new Set());
			this.steps.forEach((s) => s.speciesCounts.push(0n));
		}
	}

	public step(endTime: Decimal | number | null = null): boolean {
		const currentStep = this.steps[this.steps.length - 1];
		const propensities = this.reactions.map((r, i) => {
			let p = this.lastReactionPropensities[i];
			if (p === null) {
				p = this.calculatePropensity(r, currentStep.speciesCounts);
				this.lastPartialTotalPropensity =
					this.lastPartialTotalPropensity.add(p);
				this.lastReactionPropensities[i] = p;
			}
			return p;
		});
		const totalPropensity = this.lastPartialTotalPropensity;
		const r1 = this.random.nextDouble();
		const tau = Decimal.ln(Decimal.div(1, r1)).div(totalPropensity);
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
		const reactionsToRemoveFromCache = new Set<number>([j]);
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] - reaction.from[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		for (let i = 0; i < reaction.to.length; i++) {
			const n = reaction.to[i].node;
			const nIndex = this.nodesOrder.get(n)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + reaction.to[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(n)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => {
			this.lastReactionPropensities[r] = null;
			this.lastPartialTotalPropensity = this.lastPartialTotalPropensity.sub(
				propensities[r]
			);
		});
		const nextTime = currentStep.time.add(tau);
		if (endTime !== null && nextTime.comparedTo(endTime) > 0) {
			return false;
		}
		const nextStep = new Step(nextTime, newSpeciesCounts, reaction);
		this.steps.push(nextStep);
		return true;
	}

	private calculatePropensity(
		reaction: Reaction,
		speciesCounts: bigint[]
	): Decimal {
		let inputsPropensity = 1n;
		for (let i = 0; i < reaction.from.length; i++) {
			const n = reaction.from[i];
			const available = speciesCounts[this.nodesOrder.get(n.node)!];
			if (available >= n.amount) {
				inputsPropensity *= this.calculateReactantCombinatorialCoefficient(
					n.amount,
					available
				);
			} else {
				// Early out as we don't have enough inputs
				return Decimal(0);
			}
		}
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
		if (n === 0n || n === 1n) {
			return 1n;
		}
		if (
			this.approximateFactorialsFrom !== null &&
			n >= this.approximateFactorialsFrom
		) {
			return this.stirlingApproxFactorial(n);
		}
		let result = 1n;
		for (let i = 2n; i <= n; i++) {
			result *= i;
		}
		return result;
	}

	private stirlingApproxFactorial(n: bigint): bigint {
		const N = new Decimal(n.toString());
		const pi = new Decimal(Math.PI);
		const e = new Decimal(Math.E);
		// sqrt(2 * pi * n) * (n / e)^n
		const f = Decimal.sqrt(pi.times(N.times(2)))
			.times(N.div(e).pow(N))
			.floor();
		return BigInt(f.toFixed(0));
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
		const reactionsToRemoveFromCache = new Set<number>();
		for (let i = 0; i < nodeValues.length; i++) {
			const nIndex = this.nodesOrder.get(nodeValues[i].node)!;
			newSpeciesCounts[nIndex] =
				newSpeciesCounts[nIndex] + nodeValues[i].amount;
			// Remove cached propensity for recalculation
			this.nodeToReactionsMap
				.get(nodeValues[i].node)!
				.forEach((r) => reactionsToRemoveFromCache.add(r));
		}
		// Remove all reactions for which the inputs changed from the last sum
		reactionsToRemoveFromCache.forEach((r) => {
			const previousPropensity = this.lastReactionPropensities[r];
			if (previousPropensity !== null) {
				this.lastReactionPropensities[r] = null;
				this.lastPartialTotalPropensity =
					this.lastPartialTotalPropensity.sub(previousPropensity);
			}
		});
		const nextStep = new Step(time ?? currentStep.time, newSpeciesCounts, null);
		this.steps.push(nextStep);
	}

	public getMaxTime(): Decimal {
		return this.steps.length === 0
			? Decimal(0)
			: this.steps[this.steps.length - 1].time;
	}
}

export class Step {
	public readonly time: Decimal;
	public readonly speciesCounts: bigint[];
	/**
	 * The reaction that fired to generate this step or null
	 * for the start step or if node quantities have been injected.
	 */
	public readonly reaction: Reaction | null;

	constructor(
		time: Decimal,
		speciesCounts: bigint[],
		reaction: Reaction | null
	) {
		this.time = time;
		this.speciesCounts = speciesCounts;
		this.reaction = reaction;
	}
}
