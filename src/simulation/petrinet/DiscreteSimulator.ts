import Decimal from 'decimal.js';
import {Simulator} from '../Simulator';
import {Transition} from '../../model/petrinet/Transition';
import {Place} from '../../model/petrinet/Place';
import {Arc} from '../../model/petrinet/Arc';
import {RandomGenerator} from '../../random/RandomGenerator';
import {ArcType} from '../../model/petrinet/ArcType';
import {DiscretePlace} from '../../model/petrinet/DiscretePlace';
import {StochasticSampler} from '../../sampler/StochasticSampler';
import {DiscreteTransition} from '../../model/petrinet/DiscreteTransition';
import {StochasticTransition} from '../../model/petrinet/StochasticTransition';
import {Parameter} from '../../model/petrinet/Parameter';
import {ConflictHandling} from '../../model/petrinet/ConflictHandling';
import {Xorshift128Plus} from '../../random/Xorshift128Plus';
import {ExpressionConfiguration} from './ExpressionConfiguration';

/**
 * Simulator for extended, timed, functional, stochastic, discrete Petri Nets with capacities.
 */
export class DiscreteSimulator extends Simulator {
	private readonly places = new Map<DiscretePlace, PlaceDetails>();
	private readonly placesOrder = new Map<DiscretePlace, number>();
	private readonly transitions = new Map<Transition, TransitionDetails>();
	private readonly arcTransitions = new Map<Arc, TransitionDetails>();
	private readonly arcPlaces = new Map<Arc, PlaceDetails>();

	private readonly markings: Marking[] = [];
	private readonly openMarkings: Marking[] = [];
	private readonly firingEdges: FiringEdge[] = [];
	private readonly outEdges = new Map<Marking, FiringEdge[]>();
	private readonly inEdges = new Map<Marking, FiringEdge[]>();

	constructor(
		nodes: (Transition | Place)[],
		arcs: Arc[],
		random: RandomGenerator = new Xorshift128Plus(42n)
	) {
		super(random, ExpressionConfiguration.mathjs);
		// Collect places and transitions
		nodes.forEach((node) => {
			if (node instanceof Transition) {
				this.transitions.set(node, new TransitionDetails(node, random));
			} else if (node instanceof DiscretePlace) {
				this.places.set(node, new PlaceDetails(node));
				this.placesOrder.set(node, this.placesOrder.size);
			} else {
				throw (
					"Petri net is not fully discrete. Found node of type '" +
					typeof node +
					"'"
				);
			}
		});
		// Collect all transition source and target places
		arcs.forEach((arc) => {
			if (arc.from instanceof DiscretePlace && arc.to instanceof Transition) {
				const place = this.places.get(arc.from)!;
				const transition = this.transitions.get(arc.to)!;
				transition.sources.push(arc);
				this.arcTransitions.set(arc, transition);
				this.arcPlaces.set(arc, place);
				if (arc.type === ArcType.Regular) {
					place.outputProbabilitiesNormalizedArcOrder.push(arc);
					place.outputProbabilitiesNormalized.set(
						arc,
						Decimal.max(Decimal(arc.probability), Decimal(0))
					);
					place.outputPrioritiesOrdered.push(arc);
				}
			} else if (
				arc.from instanceof Transition &&
				arc.to instanceof DiscretePlace
			) {
				const transition = this.transitions.get(arc.from)!;
				const place = this.places.get(arc.to)!;
				transition.targets.push(arc);
				this.arcTransitions.set(arc, transition);
				this.arcPlaces.set(arc, place);
				if (arc.type === ArcType.Regular) {
					place.inputProbabilitiesNormalizedArcOrder.push(arc);
					place.inputProbabilitiesNormalized.set(
						arc,
						Decimal.max(Decimal(arc.probability), Decimal(0))
					);
					place.inputPrioritiesOrdered.push(arc);
				}
			}
		});
		// Normalize place probabilities and sort priorities
		this.places.forEach((place) => {
			place.sortPriorities();
			place.normalizeProbabilities();
		});
		this.initialize(Decimal(0));
	}

	private initialize(startTime: Decimal): void {
		this.markings.splice(0, this.markings.length);
		this.openMarkings.splice(0, this.openMarkings.length);
		this.firingEdges.splice(0, this.firingEdges.length);
		// Create the initial marking and store it in the graph as well as the open list
		const placeTokens: bigint[] = new Array(this.places.size);
		this.places.forEach((_, place) => {
			const placeIndex = this.placesOrder.get(place)!;
			placeTokens[placeIndex] = place.tokenStart;
		});
		const startMarking = new Marking(
			startTime,
			placeTokens,
			this.determineConcession(startTime, placeTokens, new Map<Arc, bigint>())
		);
		this.markings.push(startMarking);
		this.openMarkings.push(startMarking);
	}

	private determineConcession(
		time: Decimal,
		placeTokens: bigint[],
		fixedArcWeights: Map<Arc, bigint>
	): Concession[] {
		const concessions: Concession[] = [];
		this.transitions.forEach((transition) => {
			if (transition.transition.knockedOut) {
				return;
			}
			if (transition.firingCondition.trim() !== '') {
				if ('false' === transition.firingCondition.toLowerCase()) {
					return;
				} else if ('true' !== transition.firingCondition.toLowerCase()) {
					const firingConditionScope = DiscreteSimulator.createExpressionScope(
						this.placesOrder,
						placeTokens,
						transition.transition.parameters
					);
					firingConditionScope['time'] = time;
					try {
						if (
							!ExpressionConfiguration.evaluate(
								transition.firingCondition,
								firingConditionScope
							).getBooleanValue()
						) {
							return;
						}
					} catch (e) {
						throw (
							"Failed to evaluate firingCondition function for transition '" +
							transition.transition.name +
							"': " +
							transition.firingCondition +
							'\n' +
							e
						);
					}
				}
			}
			// Collect the subset of connected places so we don't copy the whole net's marking each time
			const putativeTokensMap = new Map<DiscretePlace, bigint>();
			transition.sources.forEach((arc) => {
				const place = arc.from as DiscretePlace;
				const placeIndex = this.placesOrder.get(place)!;
				putativeTokensMap.set(place, placeTokens[placeIndex]);
			});
			transition.targets.forEach((arc) => {
				const place = arc.to as DiscretePlace;
				const placeIndex = this.placesOrder.get(place)!;
				putativeTokensMap.set(place, placeTokens[placeIndex]);
			});
			let valid = true;
			// Validate pre-conditions (test and inhibition arcs or constant places)
			for (let i = 0; i < transition.sources.length; i++) {
				const arc = transition.sources[i];
				if (
					arc.type === ArcType.Regular &&
					arc.from instanceof Place &&
					!arc.from.isConstant
				) {
					continue;
				}
				const place = arc.from as DiscretePlace;
				let requestedTokens = fixedArcWeights.get(arc)!;
				if (requestedTokens == null) {
					requestedTokens = this.evaluateFunction(placeTokens, arc);
				}
				if (requestedTokens < 0) {
					valid = false;
					break;
				}
				if (putativeTokensMap.get(place)! >= requestedTokens) {
					// If enough tokens are available and the arc is an inhibitor arc, validation fails
					if (arc.type === ArcType.Inhibition) {
						valid = false;
						break;
					}
				} else {
					// If not enough tokens are available and the arc is either a test arc or a regular arc and the
					// connected place constant, validation fails
					if (
						arc.type === ArcType.Test ||
						(arc.type === ArcType.Regular &&
							arc.from instanceof Place &&
							arc.from.isConstant)
					) {
						valid = false;
						break;
					}
				}
			}
			// Validate normal incoming arcs
			for (let i = 0; i < transition.sources.length; i++) {
				const arc = transition.sources[i];
				if (
					arc.type !== ArcType.Regular ||
					(arc.from instanceof Place && arc.from.isConstant)
				) {
					continue;
				}
				const place = this.places.get(arc.from as DiscretePlace)!;
				let requestedTokens = fixedArcWeights.get(arc)!;
				if (requestedTokens == null) {
					requestedTokens = this.evaluateFunction(placeTokens, arc);
				}
				if (requestedTokens < 0) {
					valid = false;
					break;
				}
				const newTokens = putativeTokensMap.get(place.place)! - requestedTokens;
				if (
					newTokens >= place.minTokens &&
					(place.maxTokens === null || newTokens <= place.maxTokens)
				) {
					putativeTokensMap.set(place.place, newTokens);
				} else {
					valid = false;
					break;
				}
			}
			if (valid) {
				// Validate normal outgoing arcs
				for (let i = 0; i < transition.targets.length; i++) {
					const arc = transition.targets[i];
					if (
						arc.type !== ArcType.Regular ||
						(arc.to instanceof DiscretePlace && arc.to.isConstant)
					) {
						continue;
					}
					const place = this.places.get(arc.to as DiscretePlace)!;
					let producedTokens = fixedArcWeights.get(arc)!;
					if (producedTokens == null) {
						producedTokens = this.evaluateFunction(placeTokens, arc);
					}
					if (producedTokens < 0) {
						valid = false;
						break;
					}
					const newTokens =
						putativeTokensMap.get(place.place)! + producedTokens;
					if (
						newTokens >= place.minTokens &&
						(place.maxTokens === null || newTokens <= place.maxTokens)
					) {
						putativeTokensMap.set(place.place, newTokens);
					} else {
						valid = false;
						break;
					}
				}
				if (valid) {
					// If all validations succeeded, evaluate the transition's delay and store the concession if the
					// delay is non-negative
					const delay = transition.getDelay(this.placesOrder, placeTokens);
					if (delay.isZero() || delay.isPositive()) {
						concessions.push(new Concession(transition, delay));
					}
				}
			}
		});
		return concessions.sort((a, b) => a.delay.comparedTo(b.delay));
	}

	public step(endTime: Decimal | number | null = null): boolean {
		if (this.openMarkings.length === 0) {
			return false;
		}
		const previousMarkingCount = this.markings.length;
		const markingsToProcess = [...this.openMarkings];
		this.openMarkings.splice(0, this.openMarkings.length);
		markingsToProcess.forEach((marking) => {
			if (marking.isDead) {
				return;
			}
			// Determine which transitions should fire next based on the smallest delay
			const minDelay = marking.concessionsOrderedByDelay[0].delay;
			// If we defined an end time and would move past this time limit, skip expanding this marking
			if (
				endTime !== null &&
				marking.time.add(minDelay).comparedTo(endTime) > 0
			) {
				return;
			}
			let maxFireIndex = 0;
			for (let i = 1; i < marking.concessionsOrderedByDelay.length; i++) {
				if (
					marking.concessionsOrderedByDelay[i].delay.comparedTo(minDelay) > 0
				) {
					break;
				}
				maxFireIndex = i;
			}
			if (minDelay.comparedTo(Decimal(0)) > 0) {
				// Fix arc weights for next batch of transitions, so that all transitions that fire in parallel
				// (but sequential in this implementation) reference the correct place token counts of the current
				// marking.
				for (let i = 0; i < maxFireIndex + 1; i++) {
					const concession = marking.concessionsOrderedByDelay[i];
					concession.transition.sources.forEach((arc) => {
						const tokens = this.evaluateFunction(marking.placeTokens, arc);
						concession.fixedArcWeights.set(arc, tokens);
					});
					concession.transition.targets.forEach((arc) => {
						const tokens = this.evaluateFunction(marking.placeTokens, arc);
						concession.fixedArcWeights.set(arc, tokens);
					});
				}
			}
			const placeOutputs = new Map<PlaceDetails, Set<Pair<Arc, Concession>>>();
			const placeInputs = new Map<PlaceDetails, Set<Pair<Arc, Concession>>>();
			for (let i = 0; i < maxFireIndex + 1; i++) {
				const concession = marking.concessionsOrderedByDelay[i];
				concession.transition.sources.forEach((arc) => {
					if (
						arc.type === ArcType.Regular &&
						arc.from instanceof DiscretePlace &&
						!arc.from.isConstant
					) {
						const place = this.places.get(arc.from)!;
						const outputsSet = placeOutputs.has(place)
							? placeOutputs.get(place)!
							: placeOutputs
									.set(place, new Set<Pair<Arc, Concession>>())
									.get(place)!;
						outputsSet.add(new Pair<Arc, Concession>(arc, concession));
					}
				});
				concession.transition.targets.forEach((arc) => {
					if (
						arc.type === ArcType.Regular &&
						arc.to instanceof DiscretePlace &&
						!arc.to.isConstant
					) {
						const place = this.places.get(arc.to)!;
						const inputsSet = placeInputs.has(place)
							? placeInputs.get(place)!
							: placeInputs
									.set(place, new Set<Pair<Arc, Concession>>())
									.get(place)!;
						inputsSet.add(new Pair<Arc, Concession>(arc, concession));
					}
				});
			}

			const outputConflictPlaces = new Set<PlaceDetails>();
			const inputConflictPlaces = new Set<PlaceDetails>();
			placeOutputs.forEach((concessions, place) => {
				if (concessions.size > 1 && !place.place.isConstant) {
					const placeIndex = this.placesOrder.get(place.place)!;
					let putativeTokens = marking.placeTokens[placeIndex];
					concessions.forEach((concession) => {
						const arc = concession.first;
						if (arc.type === ArcType.Regular) {
							const requestedTokens =
								concession.second.fixedArcWeights.get(arc)!;
							putativeTokens = putativeTokens - requestedTokens;
							if (putativeTokens < place.minTokens) {
								outputConflictPlaces.add(place);
								// TODO: break;
							}
						}
					});
				}
			});
			placeInputs.forEach((concessions, place) => {
				if (concessions.size > 1 && !place.place.isConstant) {
					const placeIndex = this.placesOrder.get(place.place)!;
					let putativeTokens = marking.placeTokens[placeIndex];
					concessions.forEach((concession) => {
						const arc = concession.first;
						if (arc.type === ArcType.Regular) {
							const requestedTokens =
								concession.second.fixedArcWeights.get(arc)!;
							putativeTokens = putativeTokens + requestedTokens;
							if (
								place.maxTokens !== null &&
								putativeTokens > place.maxTokens
							) {
								inputConflictPlaces.add(place);
								// TODO: break;
							}
						}
					});
				}
			});
			// Build the set of firing transitions by resolving conflicts, if necessary
			const fireSet = new Set<Concession>();
			if (outputConflictPlaces.size === 0 && inputConflictPlaces.size === 0) {
				for (let i = 0; i < maxFireIndex + 1; i++) {
					fireSet.add(marking.concessionsOrderedByDelay[i]);
				}
			} else {
				const transitionConcessions = new Map<TransitionDetails, Concession>();
				for (let i = 0; i < maxFireIndex + 1; i++) {
					const concession = marking.concessionsOrderedByDelay[i];
					transitionConcessions.set(concession.transition, concession);
				}
				const placeFireSets = new Map<PlaceDetails, Set<Concession>>();
				const placeDiscardedSets = new Map<PlaceDetails, Set<Concession>>();
				// Collect all non-conflicted place fire sets from inputs and outputs
				placeOutputs.forEach((concessions, place) => {
					if (!outputConflictPlaces.has(place)) {
						const placeFireSet = placeFireSets.has(place)
							? placeFireSets.get(place)!
							: placeFireSets.set(place, new Set<Concession>()).get(place)!;
						concessions.forEach((concession) =>
							placeFireSet.add(concession.second)
						);
					}
				});
				placeInputs.forEach((concessions, place) => {
					if (!inputConflictPlaces.has(place)) {
						const placeFireSet = placeFireSets.has(place)
							? placeFireSets.get(place)!
							: placeFireSets.set(place, new Set<Concession>()).get(place)!;
						concessions.forEach((concession) =>
							placeFireSet.add(concession.second)
						);
					}
				});
				if (outputConflictPlaces.size > 0) {
					outputConflictPlaces.forEach((place) => {
						this.resolvePlaceOutputConflict(
							marking,
							place,
							transitionConcessions,
							placeFireSets,
							placeDiscardedSets
						);
					});
				}
				// If input conflicts exist, further reduce the place fire sets in regard to post place capacities
				if (inputConflictPlaces.size > 0) {
					inputConflictPlaces.forEach((place) => {
						this.resolvePlaceInputConflict(
							marking,
							place,
							transitionConcessions,
							placeFireSets,
							placeDiscardedSets
						);
					});
				}
				// Reduce the place fire sets by the place discarded sets to remove transitions that were
				// excluded on a per-place basis
				placeFireSets.forEach((placeFireSet) => {
					placeDiscardedSets.forEach((concessions) => {
						concessions.forEach((concession) =>
							placeFireSet.delete(concession)
						);
					});
					placeFireSet.forEach((concession) => fireSet.add(concession));
				});
			}
			// Finally, fire all transitions in the fire set in parallel
			this.fireTransitions(marking, fireSet, minDelay, maxFireIndex + 1);
		});
		return this.markings.length > previousMarkingCount;
	}

	private resolvePlaceOutputConflict(
		marking: Marking,
		place: PlaceDetails,
		transitionConcessions: Map<TransitionDetails, Concession>,
		placeFireSets: Map<PlaceDetails, Set<Concession>>,
		placeDiscardedSets: Map<PlaceDetails, Set<Concession>>
	): void {
		const placeIndex = this.placesOrder.get(place.place)!;
		let putativeTokens = marking.placeTokens[placeIndex];
		const placeFireSet = new Set<Concession>();
		const placeDiscardedSet = new Set<Concession>();
		if (place.place.conflictStrategy === ConflictHandling.Priority) {
			// Handle conflict with priority
			place.outputPrioritiesOrdered.forEach((arc) => {
				const transition = this.arcTransitions.get(arc)!;
				const concession = transitionConcessions.get(transition)!;
				// If this transition has no concession, skip it
				if (concession == null) {
					return;
				}
				// If we already checked this transition with a higher-priority arc, skip it
				if (placeFireSet.has(concession) || placeDiscardedSet.has(concession)) {
					return;
				}
				let requestedTokens = 0n;
				transition.sources.forEach((sourceArc) => {
					if (
						sourceArc.type === ArcType.Regular &&
						this.arcPlaces.get(sourceArc) == place
					) {
						requestedTokens += concession.fixedArcWeights.get(sourceArc)!;
					}
				});
				if (putativeTokens - requestedTokens >= place.minTokens) {
					putativeTokens -= requestedTokens;
					placeFireSet.add(concession);
				} else {
					placeDiscardedSet.add(concession);
				}
			});
		} else {
			// Handle conflict with probability
			const transitionCandidates: TransitionDetails[] = [];
			const transitionCandidateProbabilities: Decimal[] = [];
			place.outputProbabilitiesNormalizedArcOrder.forEach((arc) => {
				const transition = this.arcTransitions.get(arc)!;
				const concession = transitionConcessions.get(transition);
				// If this transition has no concession, skip it
				if (concession == null) {
					return;
				}
				const index = transitionCandidates.indexOf(transition);
				if (index == -1) {
					transitionCandidates.push(transition);
					transitionCandidateProbabilities.push(
						place.outputProbabilitiesNormalized.get(arc)!
					);
				} else {
					transitionCandidateProbabilities[index] =
						transitionCandidateProbabilities[index].add(
							place.outputProbabilitiesNormalized.get(arc)!
						);
				}
			});
			while (transitionCandidates.length > 0) {
				// Normalize probabilities
				let sum = Decimal(0);
				transitionCandidateProbabilities.forEach(
					(probability) => (sum = sum.add(probability))
				);
				for (let i = 0; i < transitionCandidateProbabilities.length; i++) {
					transitionCandidateProbabilities[i] =
						transitionCandidateProbabilities[i].div(sum);
				}
				// Choose the next transition at random
				let randomValue = Decimal(this.random.nextDouble());
				let index = 0;
				for (; index < transitionCandidates.length; index++) {
					const probability = transitionCandidateProbabilities[index];
					if (randomValue.comparedTo(probability) < 0) {
						break;
					}
					randomValue = randomValue.sub(probability);
				}
				// Check the transition with available tokens and remove it from the candidate list
				const transition = transitionCandidates[index];
				const concession = transitionConcessions.get(transition)!;
				transitionCandidates.splice(index, 1);
				transitionCandidateProbabilities.splice(index, 1);
				let requestedTokens = 0n;
				transition.sources.forEach((sourceArc) => {
					if (
						sourceArc.type === ArcType.Regular &&
						this.arcPlaces.get(sourceArc) == place
					) {
						requestedTokens += concession.fixedArcWeights.get(sourceArc)!;
					}
				});
				if (putativeTokens - requestedTokens >= place.minTokens) {
					putativeTokens -= requestedTokens;
					placeFireSet.add(concession);
				} else {
					placeDiscardedSet.add(concession);
				}
			}
		}
		if (placeFireSets.has(place)) {
			const fireSet = placeFireSets.get(place)!;
			placeFireSet.forEach((concession) => fireSet.add(concession));
		} else {
			placeFireSets.set(place, placeFireSet);
		}
		placeDiscardedSets.set(place, placeDiscardedSet);
	}

	private resolvePlaceInputConflict(
		marking: Marking,
		place: PlaceDetails,
		transitionConcessions: Map<TransitionDetails, Concession>,
		placeFireSets: Map<PlaceDetails, Set<Concession>>,
		placeDiscardedSets: Map<PlaceDetails, Set<Concession>>
	): void {
		const placeIndex = this.placesOrder.get(place.place)!;
		let putativeTokens = marking.placeTokens[placeIndex];
		const placeFireSet = new Set<Concession>();
		const placeDiscardedSet = placeDiscardedSets.has(place)
			? placeDiscardedSets.get(place)!
			: placeDiscardedSets.set(place, new Set<Concession>()).get(place)!;
		if (place.place.conflictStrategy === ConflictHandling.Priority) {
			// Handle conflict with priority
			place.inputPrioritiesOrdered.forEach((arc) => {
				const transition = this.arcTransitions.get(arc)!;
				const concession = transitionConcessions.get(transition)!;
				// If this transition has no concession, skip it
				if (concession == null) {
					return;
				}
				// If we already checked this transition with a higher-priority arc, skip it
				if (placeFireSet.has(concession) || placeDiscardedSet.has(concession)) {
					return;
				}
				let producedTokens = 0n;
				transition.targets.forEach((sourceArc) => {
					if (
						sourceArc.type === ArcType.Regular &&
						this.arcPlaces.get(sourceArc) == place
					) {
						producedTokens += concession.fixedArcWeights.get(sourceArc)!;
					}
				});
				if (
					place.maxTokens === null ||
					putativeTokens + producedTokens <= place.maxTokens
				) {
					putativeTokens += producedTokens;
					placeFireSet.add(concession);
				} else {
					placeDiscardedSet.add(concession);
				}
			});
		} else {
			// Handle conflict with probability
			const transitionCandidates: TransitionDetails[] = [];
			const transitionCandidateProbabilities: Decimal[] = [];
			place.inputProbabilitiesNormalizedArcOrder.forEach((arc) => {
				const transition = this.arcTransitions.get(arc)!;
				const concession = transitionConcessions.get(transition)!;
				// If this transition has no concession, or it was already discarded in an output conflict, skip it
				if (concession == null || placeDiscardedSet.has(concession)) {
					return;
				}
				const index = transitionCandidates.indexOf(transition);
				if (index == -1) {
					transitionCandidates.push(transition);
					transitionCandidateProbabilities.push(
						place.inputProbabilitiesNormalized.get(arc)!
					);
				} else {
					transitionCandidateProbabilities[index] =
						transitionCandidateProbabilities[index].add(
							place.inputProbabilitiesNormalized.get(arc)!
						);
				}
			});
			while (transitionCandidates.length > 0) {
				// Normalize probabilities
				let sum = Decimal(0);
				transitionCandidateProbabilities.forEach(
					(probability) => (sum = sum.add(probability))
				);
				for (let i = 0; i < transitionCandidateProbabilities.length; i++) {
					transitionCandidateProbabilities[i] =
						transitionCandidateProbabilities[i].div(sum);
				}
				// Choose the next transition at random
				let randomValue = Decimal(this.random.nextDouble());
				let index = 0;
				for (; index < transitionCandidates.length; index++) {
					const probability = transitionCandidateProbabilities[index];
					if (randomValue.comparedTo(probability) < 0) {
						break;
					}
					randomValue = randomValue.sub(probability);
				}
				// Check the transition with available tokens and remove it from the candidate list
				const transition = transitionCandidates[index];
				const concession = transitionConcessions.get(transition)!;
				transitionCandidates.splice(index, 1);
				transitionCandidateProbabilities.splice(index, 1);
				let producedTokens = 0n;
				transition.targets.forEach((sourceArc) => {
					if (
						sourceArc.type === ArcType.Regular &&
						this.arcPlaces.get(sourceArc) == place
					) {
						producedTokens += concession.fixedArcWeights.get(sourceArc)!;
					}
				});
				if (
					place.maxTokens === null ||
					putativeTokens + producedTokens <= place.maxTokens
				) {
					putativeTokens += producedTokens;
					placeFireSet.add(concession);
				} else {
					placeDiscardedSet.add(concession);
				}
			}
		}
		if (placeFireSets.has(place)) {
			const fireSet = placeFireSets.get(place)!;
			placeFireSet.forEach((concession) => fireSet.add(concession));
		} else {
			placeFireSets.set(place, placeFireSet);
		}
		placeDiscardedSets.set(place, placeDiscardedSet);
	}

	private fireTransitions(
		marking: Marking,
		concessions: Set<Concession>,
		delay: Decimal,
		skipRetainConcessions: number
	): void {
		const newTime = marking.time.add(delay);
		const placeTokens: bigint[] = [...marking.placeTokens];
		concessions.forEach((concession) => {
			const transition = concession.transition;
			transition.sources.forEach((arc) => {
				// Test and inhibition arcs as well as constant places don't destroy tokens
				if (
					arc.type !== ArcType.Regular ||
					(arc.from instanceof Place && arc.from.isConstant)
				) {
					return;
				}
				const place = arc.from as DiscretePlace;
				const placeIndex = this.placesOrder.get(place)!;
				const requestedTokens = concession.fixedArcWeights.get(arc)!;
				placeTokens[placeIndex] -= requestedTokens;
			});
			transition.targets.forEach((arc) => {
				// In the malformed case of non-regular arcs and constant places don't produce tokens
				if (
					arc.type !== ArcType.Regular ||
					(arc.to instanceof Place && arc.to.isConstant)
				) {
					return;
				}
				const place = arc.to as DiscretePlace;
				const placeIndex = this.placesOrder.get(place)!;
				const producedTokens = concession.fixedArcWeights.get(arc)!;
				placeTokens[placeIndex] += producedTokens;
			});
		});
		// Determine new markings concessions and delays considering previous concession delays
		const fixedArcWeights = new Map<Arc, bigint>();
		marking.concessionsOrderedByDelay.forEach((nextConcession) => {
			if (!concessions.has(nextConcession)) {
				nextConcession.fixedArcWeights.forEach((value, arc) =>
					fixedArcWeights.set(arc, value)
				);
			}
		});
		const newConcessions = this.determineConcession(
			newTime,
			placeTokens,
			fixedArcWeights
		);
		const nextMarkingConcessions: Concession[] = [];
		// First, retain all transitions that still have concession and reduce their delay
		for (
			let i = skipRetainConcessions;
			i < marking.concessionsOrderedByDelay.length;
			i++
		) {
			const nextConcession = marking.concessionsOrderedByDelay[i];
			if (!concessions.has(nextConcession)) {
				for (let j = 0; j < newConcessions.length; j++) {
					const checkConcession = newConcessions[j];
					if (nextConcession.transition === checkConcession.transition) {
						nextMarkingConcessions.push(nextConcession.retain(delay));
						break;
					}
				}
			}
		}
		// Second, add all new concessions
		newConcessions.forEach((nextConcession) => {
			let alreadyPresent = false;
			for (let j = 0; j < nextMarkingConcessions.length; j++) {
				const checkConcession = nextMarkingConcessions[j];
				if (nextConcession.transition === checkConcession.transition) {
					alreadyPresent = true;
					break;
				}
			}
			if (!alreadyPresent) {
				nextMarkingConcessions.push(nextConcession);
			}
		});
		// Create the new marking
		const newMarking = new Marking(
			newTime,
			placeTokens,
			nextMarkingConcessions.sort((a, b) => a.delay.comparedTo(b.delay))
		);
		this.markings.push(newMarking);
		if (!newMarking.isDead) {
			this.openMarkings.push(newMarking);
		}
		const edge = new FiringEdge(
			marking,
			newMarking,
			[...concessions].map((c) => c.transition)
		);
		this.firingEdges.push(edge);
		if (!this.outEdges.has(marking)) {
			this.outEdges.set(marking, []);
		}
		this.outEdges.get(marking)!.push(edge);
		if (!this.inEdges.has(newMarking)) {
			this.inEdges.set(newMarking, []);
		}
		this.inEdges.get(newMarking)!.push(edge);
	}

	public getMaxTime(): Decimal {
		let result = this.markings[0].time;
		this.markings.forEach((marking) => {
			if (marking.time.comparedTo(result) > 0) {
				result = marking.time;
			}
		});
		return result;
	}

	public getStartMarking(): Marking {
		return this.markings[0];
	}

	public getMarkingTimeline(): Marking[] {
		const markings: Marking[] = [];
		markings.push(this.getStartMarking());
		let foundNext = true;
		while (foundNext) {
			const edges = this.outEdges.get(markings[markings.length - 1]);
			foundNext = edges != null;
			if (edges != null) {
				markings.push(edges[0].to);
			}
		}
		return markings;
	}

	public getTokens(marking: Marking, place: DiscretePlace): bigint {
		return marking.placeTokens[this.placesOrder.get(place)!];
	}

	public get isDead(): boolean {
		return this.openMarkings.length === 0;
	}

	public getEdges(): FiringEdge[] {
		return [...this.firingEdges];
	}

	public getMarkings(): Marking[] {
		return [...this.markings];
	}

	evaluateFunction(placeTokens: bigint[], arc: Arc): bigint {
		const scope = DiscreteSimulator.createExpressionScope(
			this.placesOrder,
			placeTokens,
			arc.parameters
		);
		try {
			const result = ExpressionConfiguration.evaluate(arc.function, scope);
			if (result instanceof BigInt) {
				return result as bigint;
			} else if (result instanceof Decimal) {
				return BigInt(result.truncated().toString());
			}
			return BigInt(
				Decimal(result as number)
					.truncated()
					.toString()
			);
		} catch (e) {
			throw (
				"Failed to evaluate function for arc '" +
				arc.id +
				"' from '" +
				arc.from.name +
				"' to '" +
				arc.to.name +
				"': " +
				arc.function +
				'\n' +
				e
			);
		}
	}

	static createExpressionScope(
		placesOrder: Map<DiscretePlace, number>,
		placeTokens: bigint[],
		parameters: Parameter[]
	): {[key: string]: Decimal | bigint} {
		const scope: {[key: string]: Decimal | bigint} = {};
		parameters.forEach((param) => {
			scope[param.name] = param.value;
		});
		placesOrder.forEach((index, place) => {
			scope[place.name] = placeTokens[index];
		});
		return scope;
	}

	static evaluateExpression(
		placesOrder: Map<DiscretePlace, number>,
		placeTokens: bigint[],
		f: string,
		parameters: Parameter[]
	) {
		const scope = DiscreteSimulator.createExpressionScope(
			placesOrder,
			placeTokens,
			parameters
		);
		return ExpressionConfiguration.evaluate(f, scope);
	}
}

class Concession {
	public readonly transition: TransitionDetails;
	public readonly delay: Decimal;
	public readonly fixedArcWeights = new Map<Arc, bigint>();
	public readonly retained: boolean;

	constructor(
		transition: TransitionDetails,
		delay: Decimal,
		retained: boolean = false
	) {
		this.transition = transition;
		this.delay = delay;
		this.retained = retained;
	}

	retain(elapsedDelay: Decimal): Concession {
		const result = new Concession(
			this.transition,
			this.delay.sub(elapsedDelay),
			true
		);
		this.fixedArcWeights.forEach((value, arc) =>
			result.fixedArcWeights.set(arc, value)
		);
		return result;
	}

	public toString(): string {
		return this.delay.toString() + ' - ' + this.transition;
	}
}

class TransitionDetails {
	public readonly transition: Transition;
	readonly sources: Arc[] = [];
	readonly targets: Arc[] = [];
	readonly firingCondition: string;
	fixedDelay: Decimal | null = null;
	delayFunction: string | null = null;
	delaySampler: StochasticSampler | null = null;

	constructor(transition: Transition, random: RandomGenerator) {
		this.transition = transition;
		this.firingCondition = transition.firingCondition;
		if (transition instanceof DiscreteTransition) {
			this.delayFunction = transition.delay;
			// If the delay function has no token dependencies, evaluate it and cache the result
			try {
				const scope: {[key: string]: Decimal} = {};
				transition.parameters.forEach((param) => {
					scope[param.name] = param.value;
				});
				const fixedDelay = ExpressionConfiguration.evaluate(
					this.delayFunction,
					scope
				);
				this.fixedDelay = fixedDelay;
			} catch (_) {
				// Error: Undefined symbol
				this.fixedDelay = null;
			}
		} else if (transition instanceof StochasticTransition) {
			this.delaySampler = transition.getDistributionSampler(random);
		}
	}

	getDelay(
		placesOrder: Map<DiscretePlace, number>,
		placeTokens: bigint[]
	): Decimal {
		if (this.fixedDelay != null) {
			return this.fixedDelay;
		}
		if (this.delayFunction != null) {
			try {
				return DiscreteSimulator.evaluateExpression(
					placesOrder,
					placeTokens,
					this.delayFunction,
					this.transition.parameters
				);
			} catch (e) {
				throw (
					"Failed to evaluate delay function for transition '" +
					this.transition.name +
					"': " +
					this.delayFunction +
					'\n' +
					e
				);
			}
		}
		if (this.delaySampler != null) {
			const delay = this.delaySampler.sample();
			if (delay.isNegative()) {
				throw (
					"Stochastic delay distribution returned negative value for transition '" +
					this.transition.name +
					"': " +
					this.delayFunction
				);
			}
			return delay;
		}
		throw (
			"Failed to determine delay for transition '" + this.transition.name + "'"
		);
	}
}

class PlaceDetails {
	readonly outputProbabilitiesNormalizedArcOrder: Arc[] = [];
	readonly inputProbabilitiesNormalizedArcOrder: Arc[] = [];
	readonly outputPrioritiesOrdered: Arc[] = [];
	readonly inputPrioritiesOrdered: Arc[] = [];
	readonly outputProbabilitiesNormalized = new Map<Arc, Decimal>();
	readonly inputProbabilitiesNormalized = new Map<Arc, Decimal>();
	public readonly minTokens: bigint;
	public readonly maxTokens: bigint | null;
	public readonly place: DiscretePlace;

	constructor(place: DiscretePlace) {
		this.place = place;
		this.minTokens = place.tokenMin;
		this.maxTokens = place.tokenMax;
	}

	sortPriorities(): void {
		this.outputPrioritiesOrdered.sort((a, b) => a.priority - b.priority);
		this.inputPrioritiesOrdered.sort((a, b) => a.priority - b.priority);
	}

	normalizeProbabilities(): void {
		if (this.outputProbabilitiesNormalized.size > 0) {
			let sum = Decimal(0);
			this.outputProbabilitiesNormalized.forEach(
				(probability) => (sum = sum.add(probability))
			);
			if (sum.lessThanOrEqualTo(Decimal(0))) {
				throw "Output probabilities of place '" + this.place + "' are all zero";
			}
			this.outputProbabilitiesNormalized.forEach((probability, arc) => {
				this.outputProbabilitiesNormalized.set(arc, probability.div(sum));
			});
		}
		if (Object.keys(this.inputProbabilitiesNormalized).length > 0) {
			let sum = Decimal(0);
			this.inputProbabilitiesNormalized.forEach(
				(probability) => (sum = sum.add(probability))
			);
			if (sum.lessThanOrEqualTo(Decimal(0))) {
				throw "Input probabilities of place '" + this.place + "' are all zero";
			}
			this.inputProbabilitiesNormalized.forEach((probability, arc) => {
				this.inputProbabilitiesNormalized.set(arc, probability.div(sum));
			});
		}
	}
}

export class FiringEdge {
	public readonly from: Marking;
	public readonly to: Marking;
	public readonly transitions: TransitionDetails[];

	constructor(from: Marking, to: Marking, transitions: TransitionDetails[]) {
		this.from = from;
		this.to = to;
		this.transitions = transitions;
	}

	public fires(transition: Transition): boolean {
		for (let i = 0; i < this.transitions.length; i++) {
			if (this.transitions[i].transition === transition) {
				return true;
			}
		}
		return false;
	}
}

export class Marking {
	public readonly time: Decimal;
	public readonly placeTokens: bigint[];
	public readonly concessionsOrderedByDelay: Concession[];

	constructor(
		time: Decimal,
		placeTokens: bigint[],
		concessionsOrderedByDelay: Concession[]
	) {
		this.time = time;
		this.placeTokens = placeTokens;
		this.concessionsOrderedByDelay = concessionsOrderedByDelay;
	}

	public get isDead(): boolean {
		return this.concessionsOrderedByDelay.length === 0;
	}

	public getConcession(transition: Transition): Concession | null {
		for (let i = 0; i < this.concessionsOrderedByDelay.length; i++) {
			if (
				this.concessionsOrderedByDelay[i].transition.transition === transition
			) {
				return this.concessionsOrderedByDelay[i];
			}
		}
		return null;
	}
}

class Pair<T, S> {
	public first: T;
	public second: S;

	constructor(first: T, second: S) {
		this.first = first;
		this.second = second;
	}
}
