import {beforeEach, expect, test} from 'vitest';
import Decimal from 'decimal.js';
import {Reaction} from '../../model/gillespie/Reaction';
import {Node} from '../../model/gillespie/Node';
import {
	exponentialTimeDraw,
	GillespieSimulator,
	TimeDraw,
} from './GillespieSimulator';
import {Xorshift128Plus} from '../../random/Xorshift128Plus';

beforeEach(() => {
	(Node as any).ID_COUNTER = 0;
	(Reaction as any).ID_COUNTER = 0;
});

test('singleStep', () => {
	const a = new Node('A', 2n);
	const b = new Node('B', 1n);
	const c = new Node('C', 0n);
	const r1 = new Reaction(
		'2A+B->C',
		[
			{node: a, amount: 2n},
			{node: b, amount: 1n},
		],
		[{node: c, amount: 1n}]
	);
	const simulator = new GillespieSimulator([a, b, c], [r1]);
	const isAlive = simulator.step();
	expect(isAlive).toBeTruthy();
	const steps = simulator.getSteps();
	expect(steps.length).toBe(2);
	expect(steps[1].getSpeciesCount(a)).toBe(0n);
	expect(steps[1].getSpeciesCount(b)).toBe(0n);
	expect(steps[1].getSpeciesCount(c)).toBe(1n);
});

test('inputOnlyReaction', () => {
	const a = new Node('A', 10n);
	const r1 = new Reaction('destroy', [{node: a, amount: 2n}], []);
	const simulator = new GillespieSimulator([a], [r1]);
	while (simulator.step());
	const steps = simulator.getSteps();
	expect(steps.length).toBe(6);
	expect(steps[0].getSpeciesCount(a)).toBe(10n);
	expect(steps[1].getSpeciesCount(a)).toBe(8n);
	expect(steps[2].getSpeciesCount(a)).toBe(6n);
	expect(steps[3].getSpeciesCount(a)).toBe(4n);
	expect(steps[4].getSpeciesCount(a)).toBe(2n);
	expect(steps[5].getSpeciesCount(a)).toBe(0n);
});

test('addNode appends a new species to existing steps', () => {
	const a = new Node('A', 10n);
	const simulator = new GillespieSimulator([a], []);
	const b = new Node('B', 5n);
	simulator.addNode(b);
	expect(simulator.getNodes()).toContain(b);
	// Existing steps are back-filled with 0n; the late node's startCount is ignored.
	expect(simulator.getStartStep().getSpeciesCounts()).toEqual([10n, 0n]);
});

test('addNode is idempotent for an existing node', () => {
	const a = new Node('A', 10n);
	const simulator = new GillespieSimulator([a], []);
	simulator.addNode(a);
	expect(simulator.getNodes().length).toBe(1);
	expect(simulator.getStartStep().getSpeciesCounts()).toEqual([10n]);
});

test('addReaction registers a reaction with a new product node that can fire', () => {
	const a = new Node('A', 10n);
	const simulator = new GillespieSimulator([a], []);
	const c = new Node('C', 0n);
	const r1 = new Reaction(
		'A->C',
		[{node: a, amount: 1n}],
		[{node: c, amount: 1n}]
	);
	simulator.addReaction(r1);
	expect(simulator.getReactions()).toContain(r1);
	expect(simulator.getNodes()).toContain(c);
	const isAlive = simulator.step();
	expect(isAlive).toBeTruthy();
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(9n);
	expect(last.getSpeciesCount(c)).toBe(1n);
	expect(last.reaction).toBe(r1);
});

test('addReaction is idempotent for an existing reaction', () => {
	const a = new Node('A', 10n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const simulator = new GillespieSimulator([a], [r1]);
	simulator.addReaction(r1);
	expect(simulator.getReactions().length).toBe(1);
	// Duplicate must not grow the parallel propensity-cache array.
	expect((simulator as any).lastReactionPropensities.length).toBe(1);
});

test('addReaction registers a reaction with a new reactant node that can fire', () => {
	const a = new Node('A', 0n);
	const simulator = new GillespieSimulator([a], []);
	const x = new Node('X', 3n); // brand-new node used as a reactant
	const r1 = new Reaction(
		'X->A',
		[{node: x, amount: 1n}],
		[{node: a, amount: 1n}]
	);
	simulator.addReaction(r1);
	expect(simulator.getReactions()).toContain(r1);
	expect(simulator.getNodes()).toContain(x);
	// Late-added nodes are back-filled with 0n, so seed X with a population.
	simulator.inject([{node: x, amount: 3n}], null);
	const isAlive = simulator.step();
	expect(isAlive).toBeTruthy();
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(1n);
	expect(last.getSpeciesCount(x)).toBe(2n);
	expect(last.reaction).toBe(r1);
});

test('addReaction added mid-simulation participates until depletion', () => {
	const a = new Node('A', 10n);
	const b = new Node('B', 0n);
	const r1 = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}]
	);
	const simulator = new GillespieSimulator([a, b], [r1]);
	simulator.step();
	const c = new Node('C', 0n);
	const r2 = new Reaction(
		'B->C',
		[{node: b, amount: 1n}],
		[{node: c, amount: 1n}]
	);
	simulator.addReaction(r2);
	while (simulator.step());
	// A->B->C is acyclic and count-conserving, so everything funnels into C.
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(0n);
	expect(last.getSpeciesCount(b)).toBe(0n);
	expect(last.getSpeciesCount(c)).toBe(10n);
});

test('reversibleDimerBinding', () => {
	const a = new Node('A', 10n);
	const b = new Node('B', 10n);
	const ab = new Node('AB', 0n);
	const formation = new Reaction(
		'A+B->AB',
		[
			{node: a, amount: 1n},
			{node: b, amount: 1n},
		],
		[{node: ab, amount: 1n}]
	);
	const dissociation = new Reaction(
		'AB->A+B',
		[{node: ab, amount: 1n}],
		[
			{node: a, amount: 1n},
			{node: b, amount: 1n},
		]
	);
	const simulator = new GillespieSimulator(
		[a, b, ab],
		[formation, dissociation]
	);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const steps = simulator.getSteps();
	expect(steps.length).toBe(11);
	//simulator.getNodes().forEach((n) => {
	//	console.log(n.name, steps.map((s) => s.getSpeciesCount(n)).join(', '));
	//});
});

test('a constant callback rate reproduces the equivalent fixed-rate trajectory', () => {
	// A callback that always returns the same rate must be indistinguishable
	// from a fixed rate: identical propensities each step -> identical RNG
	// draws -> identical trajectory. This also exercises the "rate unchanged ->
	// reuse the cached propensity" path over many steps.
	const build = (rate: Decimal | (() => {rate: number; cache: boolean})) => {
		const a = new Node('A', 20n);
		const b = new Node('B', 20n);
		const ab = new Node('AB', 0n);
		const formation = new Reaction(
			'A+B->AB',
			[
				{node: a, amount: 1n},
				{node: b, amount: 1n},
			],
			[{node: ab, amount: 1n}],
			rate
		);
		const dissociation = new Reaction(
			'AB->A+B',
			[{node: ab, amount: 1n}],
			[
				{node: a, amount: 1n},
				{node: b, amount: 1n},
			],
			rate
		);
		return new GillespieSimulator([a, b, ab], [formation, dissociation]);
	};
	const fixed = build(Decimal(2));
	const dynamic = build(() => ({rate: 2, cache: false}));
	for (let i = 0; i < 30; i++) {
		fixed.step();
		dynamic.step();
	}
	const fixedSteps = fixed.getSteps();
	const dynamicSteps = dynamic.getSteps();
	expect(dynamicSteps.length).toBe(fixedSteps.length);
	for (let i = 0; i < fixedSteps.length; i++) {
		expect(dynamicSteps[i].getSpeciesCounts()).toEqual(
			fixedSteps[i].getSpeciesCounts()
		);
		expect(dynamicSteps[i].time.toString()).toBe(fixedSteps[i].time.toString());
	}
});

test('a cache:true rate callback is evaluated only once and then frozen', () => {
	const a = new Node('A', 100n);
	let calls = 0;
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], () => {
		calls++;
		return {rate: 2, cache: true};
	});
	const simulator = new GillespieSimulator([a], [r1]);
	for (let i = 0; i < 5; i++) {
		simulator.step();
	}
	// After the first evaluation the rate is frozen, so the callback is never
	// called again and the reaction behaves exactly like a fixed rate.
	expect(calls).toBe(1);
	expect(simulator.getSteps().length).toBe(6);
});

test('a non-cached rate callback is re-evaluated on every step', () => {
	const a = new Node('A', 100n);
	let calls = 0;
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], () => {
		calls++;
		return {rate: 1, cache: false};
	});
	const simulator = new GillespieSimulator([a], [r1]);
	for (let i = 0; i < 5; i++) {
		simulator.step();
	}
	expect(calls).toBe(5);
});

test('a zero rate from a callback disables the reaction', () => {
	const a = new Node('A', 10n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], () => ({
		rate: 0,
		cache: false,
	}));
	const simulator = new GillespieSimulator([a], [r1]);
	// Total propensity is zero, so no event can be drawn and the net is dead.
	expect(simulator.step()).toBe(false);
	expect(simulator.getSteps().length).toBe(1);
});

test('a rate callback receives the current time and species counts', () => {
	const a = new Node('A', 7n);
	const observed: {time: string; a: bigint}[] = [];
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], (ctx) => {
		observed.push({time: ctx.time.toString(), a: ctx.count(a)});
		return {rate: 1, cache: false};
	});
	const simulator = new GillespieSimulator([a], [r1]);
	simulator.step();
	simulator.step();
	expect(observed.length).toBe(2);
	// First evaluation sees the initial state.
	expect(observed[0]).toEqual({time: '0', a: 7n});
	// After one A-> event, A dropped by one and the clock advanced.
	expect(observed[1].a).toBe(6n);
	expect(observed[1].time).not.toBe('0');
});

test('a callback returning a Decimal works and mixes with fixed rates', () => {
	const a = new Node('A', 50n);
	const b = new Node('B', 0n);
	const c = new Node('C', 0n);
	const fixed = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}],
		Decimal(1)
	);
	const dynamic = new Reaction(
		'B->C',
		[{node: b, amount: 1n}],
		[{node: c, amount: 1n}],
		() => ({rate: Decimal(3), cache: false})
	);
	const simulator = new GillespieSimulator([a, b, c], [fixed, dynamic]);
	while (simulator.step());
	// A->B->C is acyclic and count-conserving, so everything funnels into C.
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(0n);
	expect(last.getSpeciesCount(b)).toBe(0n);
	expect(last.getSpeciesCount(c)).toBe(50n);
});

test('a rate that changes as populations change stays consistent', () => {
	const a = new Node('A', 40n);
	const b = new Node('B', 0n);
	// Rate grows with the remaining A, so it changes on (almost) every step,
	// exercising the rate-change invalidation path repeatedly.
	const r1 = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}],
		(ctx) => ({rate: Decimal(1).add(ctx.count(a).toString()), cache: false})
	);
	const simulator = new GillespieSimulator([a, b], [r1]);
	let guard = 0;
	while (simulator.step() && guard++ < 10000);
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(0n);
	expect(last.getSpeciesCount(b)).toBe(40n);
	const steps = simulator.getSteps();
	for (let i = 1; i < steps.length; i++) {
		expect(steps[i].time.comparedTo(steps[i - 1].time)).toBeGreaterThan(0);
	}
});

test('a time-dependent rate is refreshed even when its reactants are untouched', () => {
	// R_fast (X->Y) fires repeatedly, advancing time but never touching A, so
	// the node->reaction invalidation never marks R_time (A->Z) stale. Only the
	// rate-change detection can notice that R_time's time-gated rate switched on.
	const x = new Node('X', 200n);
	const y = new Node('Y', 0n);
	const a = new Node('A', 5n);
	const z = new Node('Z', 0n);
	const rFast = new Reaction(
		'X->Y',
		[{node: x, amount: 1n}],
		[{node: y, amount: 1n}],
		Decimal(1)
	);
	const rTime = new Reaction(
		'A->Z',
		[{node: a, amount: 1n}],
		[{node: z, amount: 1n}],
		(ctx) => ({
			rate: ctx.time.comparedTo(Decimal('0.5')) < 0 ? 0 : 100,
			cache: false,
		})
	);
	const simulator = new GillespieSimulator([x, y, a, z], [rFast, rTime]);
	let guard = 0;
	while (simulator.step() && guard++ < 100000);
	const last = simulator.getLastStep();
	// If the stale zero propensity were never refreshed, A would never convert.
	expect(last.getSpeciesCount(a)).toBe(0n); // A fully consumed
	expect(last.getSpeciesCount(z)).toBe(5n); // all A became Z
});

test('a custom time-draw replaces the default waiting-time distribution', () => {
	const a = new Node('A', 4n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	// Deterministic mean waiting time tau = 1 / totalPropensity. With a single
	// rate-1 reaction the propensity equals the current A count, so the waiting
	// times are exactly 1/4, 1/3, 1/2, 1/1 rather than the default random draw.
	const meanTime: TimeDraw = (totalPropensity) =>
		Decimal(1).div(totalPropensity);
	const simulator = new GillespieSimulator([a], [r1], undefined, meanTime);
	while (simulator.step());
	// Rebuild the expected cumulative times with the same Decimal arithmetic the
	// simulator uses, so rounding matches exactly.
	let cumulative = Decimal(0);
	const expectedTimes = [cumulative.toString()];
	for (const propensity of [4, 3, 2, 1]) {
		cumulative = cumulative.add(Decimal(1).div(propensity));
		expectedTimes.push(cumulative.toString());
	}
	const steps = simulator.getSteps();
	expect(steps.length).toBe(5); // start + 4 decays
	expect(steps.map((s) => s.time.toString())).toEqual(expectedTimes);
});

test('a custom time-draw may return a plain number', () => {
	const a = new Node('A', 3n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const simulator = new GillespieSimulator([a], [r1], undefined, () => 0.5);
	while (simulator.step());
	const steps = simulator.getSteps();
	expect(steps.length).toBe(4);
	expect(steps[1].time.toString()).toBe('0.5');
	expect(steps[2].time.toString()).toBe('1');
	expect(steps[3].time.toString()).toBe('1.5');
});

test('exponentialTimeDraw is the default time-draw', () => {
	const build = (drawTime?: TimeDraw) => {
		const a = new Node('A', 15n);
		const b = new Node('B', 0n);
		const r1 = new Reaction(
			'A->B',
			[{node: a, amount: 1n}],
			[{node: b, amount: 1n}],
			Decimal(2)
		);
		return new GillespieSimulator(
			[a, b],
			[r1],
			new Xorshift128Plus(7n),
			drawTime
		);
	};
	const implicit = build();
	const explicit = build(exponentialTimeDraw);
	for (let i = 0; i < 15; i++) {
		implicit.step();
		explicit.step();
	}
	const implicitSteps = implicit.getSteps();
	const explicitSteps = explicit.getSteps();
	expect(explicitSteps.length).toBe(implicitSteps.length);
	for (let i = 0; i < implicitSteps.length; i++) {
		expect(explicitSteps[i].getSpeciesCounts()).toEqual(
			implicitSteps[i].getSpeciesCounts()
		);
		expect(explicitSteps[i].time.toString()).toBe(
			implicitSteps[i].time.toString()
		);
	}
});

test('inject throws when the given time precedes the last step time', () => {
	const a = new Node('A', 5n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const simulator = new GillespieSimulator([a], [r1]);
	simulator.step(); // advance the clock past 0
	const lastTime = simulator.getLastStep().time;
	expect(lastTime.comparedTo(0)).toBeGreaterThan(0);
	const stepsBefore = simulator.getSteps().length;
	expect(() => simulator.inject([{node: a, amount: 3n}], Decimal(0))).toThrow();
	// A rejected inject must not touch the trajectory.
	expect(simulator.getSteps().length).toBe(stepsBefore);
	// Injecting at exactly the last step time (or later, or with null) is allowed.
	expect(() =>
		simulator.inject([{node: a, amount: 3n}], lastTime)
	).not.toThrow();
	expect(() => simulator.inject([{node: a, amount: 3n}], null)).not.toThrow();
});

test('advanceToEndTime parks the clock exactly at endTime with a marker step', () => {
	const a = new Node('A', 100n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], Decimal(1));
	const simulator = new GillespieSimulator([a], [r1]);
	const endTime = Decimal('0.5');
	while (simulator.step(endTime, true));
	const steps = simulator.getSteps();
	const last = steps[steps.length - 1];
	expect(last.time.equals(endTime)).toBe(true); // parked exactly at 0.5
	expect(last.reaction).toBeNull(); // marker, no reaction fired
	// The marker leaves species counts identical to the preceding real step.
	expect(last.getSpeciesCounts()).toEqual(
		steps[steps.length - 2].getSpeciesCounts()
	);
});

test('without advanceToEndTime the clock stops strictly before endTime', () => {
	const a = new Node('A', 100n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], Decimal(1));
	const simulator = new GillespieSimulator([a], [r1]);
	const endTime = Decimal('0.5');
	while (simulator.step(endTime));
	const last = simulator.getLastStep();
	expect(last.time.comparedTo(endTime)).toBeLessThan(0); // never reached 0.5
	expect(last.reaction).not.toBeNull(); // last entry is a real event
});

test('after parking, rate callbacks are re-evaluated at exactly endTime', () => {
	const a = new Node('A', 50n);
	const evalTimes: string[] = [];
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], (ctx) => {
		evalTimes.push(ctx.time.toString());
		return {rate: 1, cache: false};
	});
	const simulator = new GillespieSimulator([a], [r1]);
	while (simulator.step(Decimal('0.3'), true));
	// The next step runs from the parked marker, so the callback sees time 0.3
	// exactly - this is what lets a time-specific rate change take effect there.
	simulator.step(Decimal('0.6'), true);
	expect(evalTimes).toContain('0.3');
});

test('advanceToEndTime does not add a second marker once parked', () => {
	const a = new Node('A', 100n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], Decimal(1));
	const simulator = new GillespieSimulator([a], [r1]);
	const endTime = Decimal('0.5');
	while (simulator.step(endTime, true));
	const parkedCount = simulator.getSteps().length;
	// Already parked at endTime: another capped step must not append a marker.
	expect(simulator.step(endTime, true)).toBe(false);
	expect(simulator.getSteps().length).toBe(parkedCount);
});

test('advanceToEndTime parks a dead system at endTime so it can be revived', () => {
	const a = new Node('A', 1n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], Decimal(1));
	const simulator = new GillespieSimulator([a], [r1]);
	simulator.step(); // consume the only A, leaving the system dead
	expect(simulator.getLastStep().getSpeciesCount(a)).toBe(0n);
	// Even though no reaction can fire, advancing to a future limit parks the
	// clock there (so a later, time-triggered rate change could revive it).
	expect(simulator.step(Decimal(1000), true)).toBe(false);
	const parked = simulator.getLastStep();
	expect(parked.time.equals(Decimal(1000))).toBe(true);
	expect(parked.reaction).toBeNull();
	expect(parked.getSpeciesCount(a)).toBe(0n);
	// Without advanceToEndTime a dead system stays put.
	const before = simulator.getSteps().length;
	expect(simulator.step(Decimal(2000))).toBe(false);
	expect(simulator.getSteps().length).toBe(before);
});

test('a time-gated rate revives a dead system after advancing to the limit', () => {
	// The reaction is off (rate 0) until t = 10, so the system starts dead.
	// Advancing to the t = 10 limit parks the clock there; from t = 10 the rate
	// switches on and the reaction proceeds - the exact scenario of a reaction
	// that only wakes up at a specific time.
	const a = new Node('A', 5n);
	const b = new Node('B', 0n);
	const r1 = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}],
		(ctx) => ({
			rate: ctx.time.comparedTo(10) < 0 ? 0 : 1,
			cache: false,
		})
	);
	const simulator = new GillespieSimulator([a, b], [r1]);
	// Phase 1: dead until t = 10; advanceToEndTime advances the clock to 10.
	while (simulator.step(Decimal(10), true));
	const parked = simulator.getLastStep();
	expect(parked.time.equals(Decimal(10))).toBe(true);
	expect(parked.getSpeciesCount(a)).toBe(5n); // nothing reacted before t = 10
	expect(parked.getSpeciesCount(b)).toBe(0n);
	// Phase 2: from t = 10 the rate is on; run to depletion.
	let guard = 0;
	while (simulator.step() && guard++ < 100000);
	const last = simulator.getLastStep();
	expect(last.getSpeciesCount(a)).toBe(0n); // A fully consumed
	expect(last.getSpeciesCount(b)).toBe(5n); // all A became B
	// The reaction only ever fired at or after t = 10.
	for (const step of simulator.getSteps()) {
		if (step.reaction !== null) {
			expect(step.time.comparedTo(10)).toBeGreaterThanOrEqual(0);
		}
	}
});

test('interventions at exact time points via advanceToEndTime', () => {
	// A slow decay whose rate is boosted 100x from t = 1 onwards, plus an
	// injection at t = 1. The rate change is only sampled correctly because we
	// park the clock at t = 1 before continuing.
	const a = new Node('A', 40n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], [], (ctx) => ({
		rate: ctx.time.comparedTo(1) < 0 ? 1 : 100,
		cache: false,
	}));
	const simulator = new GillespieSimulator([a], [r1]);
	// Phase 1: run up to t = 1 under the slow rate.
	while (simulator.step(Decimal(1), true));
	expect(simulator.getLastStep().time.equals(Decimal(1))).toBe(true);
	// Intervene exactly at t = 1: top A back up.
	simulator.inject([{node: a, amount: 10n}], Decimal(1));
	// Phase 2: run to completion under the fast rate.
	let guard = 0;
	while (simulator.step(undefined, true) && guard++ < 100000);
	expect(simulator.getLastStep().getSpeciesCount(a)).toBe(0n);
	// Every step is time-ordered.
	const steps = simulator.getSteps();
	for (let i = 1; i < steps.length; i++) {
		expect(steps[i].time.comparedTo(steps[i - 1].time)).toBeGreaterThanOrEqual(
			0
		);
	}
});

// --- Event-log reconstruction & streaming ---------------------------------

test('getCountsAt reconstructs every interior step of a decay', () => {
	const a = new Node('A', 6n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1]);
	while (sim.step());
	expect(sim.getStepCount()).toBe(7); // start + 6 decays
	for (let i = 0; i < sim.getStepCount(); i++) {
		const expected = [BigInt(6 - i)];
		expect(sim.getCountsAt(i)).toEqual(expected);
		expect(sim.getCountAt(i, a)).toBe(BigInt(6 - i));
		// The Step accessors must agree with the simulator's reconstruction.
		expect(sim.getSteps()[i].getSpeciesCounts()).toEqual(expected);
		expect(sim.getSteps()[i].getSpeciesCount(a)).toBe(BigInt(6 - i));
	}
});

test('Step.getSpeciesCount reads a single species at that step', () => {
	const a = new Node('A', 5n);
	const b = new Node('B', 0n);
	const r1 = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}]
	);
	const sim = new GillespieSimulator([a, b], [r1]);
	while (sim.step());
	for (const step of sim.getSteps()) {
		const counts = step.getSpeciesCounts();
		// The singular accessor agrees with the full vector and the simulator.
		expect(step.getSpeciesCount(a)).toBe(counts[0]);
		expect(step.getSpeciesCount(b)).toBe(counts[1]);
		expect(step.getSpeciesCount(a)).toBe(sim.getCountAt(step.index, a));
		// A->B conserves the total population.
		expect(step.getSpeciesCount(a) + step.getSpeciesCount(b)).toBe(5n);
	}
	// An unknown node throws (delegated to the simulator's getCountAt).
	expect(() => sim.getStartStep().getSpeciesCount(new Node('Z', 0n))).toThrow();
});

test('getCountsAt is correct for descending, repeated and out-of-range access', () => {
	const a = new Node('A', 5n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1]);
	while (sim.step());
	// Every index reconstructs from the start, so order does not matter.
	for (let i = sim.getStepCount() - 1; i >= 0; i--) {
		expect(sim.getCountsAt(i)).toEqual([BigInt(5 - i)]);
	}
	// Repeated access to the same index is stable.
	expect(sim.getCountsAt(2)).toEqual([3n]);
	expect(sim.getCountsAt(2)).toEqual([3n]);
	// Returned arrays are independent copies (mutating one does not leak).
	const copy = sim.getCountsAt(2);
	copy[0] = 999n;
	expect(sim.getCountsAt(2)).toEqual([3n]);
	expect(() => sim.getCountsAt(sim.getStepCount())).toThrow();
	expect(() => sim.getCountsAt(-1)).toThrow();
});

test('forEachStep and getCountsAt agree across a branching trajectory', () => {
	const a = new Node('A', 20n);
	const b = new Node('B', 0n);
	const c = new Node('C', 0n);
	const r1 = new Reaction(
		'A->B',
		[{node: a, amount: 1n}],
		[{node: b, amount: 1n}]
	);
	const r2 = new Reaction(
		'A->C',
		[{node: a, amount: 1n}],
		[{node: c, amount: 1n}]
	);
	const sim = new GillespieSimulator(
		[a, b, c],
		[r1, r2],
		new Xorshift128Plus(123n)
	);
	while (sim.step());
	// Two independent reconstruction paths (single-buffer walk vs per-index point
	// queries) must produce identical vectors, and A+B+C is conserved throughout.
	const viaWalk: bigint[][] = [];
	sim.forEachStep((_t, counts) => viaWalk.push(counts.slice()));
	expect(viaWalk.length).toBe(sim.getStepCount());
	for (let i = 0; i < sim.getStepCount(); i++) {
		expect(sim.getCountsAt(i)).toEqual(viaWalk[i]);
		const [x, y, z] = viaWalk[i];
		expect(x + y + z).toBe(20n);
	}
	const last = sim.getCountsAt(sim.getStepCount() - 1);
	expect(last[0]).toBe(0n); // all A consumed
	expect(last[1] + last[2]).toBe(20n);
});

test('forEachStep yields the firing reaction at each step', () => {
	const a = new Node('A', 2n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1]);
	while (sim.step());
	const rows: {i: number; a: bigint; r: string | null}[] = [];
	sim.forEachStep((_t, counts, reaction, index) => {
		rows.push({i: index, a: counts[0], r: reaction ? reaction.name : null});
	});
	expect(rows).toEqual([
		{i: 0, a: 2n, r: null},
		{i: 1, a: 1n, r: 'A->'},
		{i: 2, a: 0n, r: 'A->'},
	]);
});

test('an injection step reconstructs with the injected amount', () => {
	const a = new Node('A', 3n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1]);
	sim.step(); // idx 1: A = 2
	sim.inject([{node: a, amount: 10n}], null); // idx 2: A = 12
	sim.step(); // idx 3: A = 11
	expect(sim.getStepCount()).toBe(4);
	expect(sim.getCountsAt(0)).toEqual([3n]);
	expect(sim.getCountsAt(1)).toEqual([2n]);
	expect(sim.getCountsAt(2)).toEqual([12n]); // interior inject via stored delta
	expect(sim.getCountsAt(3)).toEqual([11n]);
});

test('onStep reports every step including the start step', () => {
	const a = new Node('A', 4n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const seen: {index: number; a: bigint}[] = [];
	const sim = new GillespieSimulator([a], [r1], undefined, undefined, {
		// Read the counts straight from the listener argument, not by reconstructing.
		onStep: (s, counts) => seen.push({index: s.index, a: counts[0]}),
	});
	while (sim.step());
	// The start step (index 0) is reported first, then every produced step, so a
	// listener can persist the whole trajectory including its initial state.
	expect(seen.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
	expect(seen.map((s) => s.a)).toEqual([4n, 3n, 2n, 1n, 0n]);
});

test('retainHistory:false keeps only start and last but streams all steps', () => {
	const a = new Node('A', 8n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const streamed: bigint[] = [];
	const sim = new GillespieSimulator([a], [r1], undefined, undefined, {
		retainHistory: false,
		// The counts argument works even with retention off, where reconstructing an
		// interior step is impossible.
		onStep: (_s, counts) => streamed.push(counts[0]),
	});
	while (sim.step());
	// Streaming includes the start step (8n) first, so the full trajectory is seen.
	expect(streamed).toEqual([8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n, 0n]);
	// Only [start, last] survive in memory, but the true count is preserved.
	expect(sim.getSteps().length).toBe(2);
	expect(sim.getStepCount()).toBe(9);
	expect(sim.getStartStep().getSpeciesCounts()).toEqual([8n]);
	expect(sim.getLastStep().getSpeciesCounts()).toEqual([0n]);
	// Interior reconstruction is unavailable once history is dropped.
	expect(() => sim.getCountsAt(3)).toThrow();
});

test('forEachStep throws with history retention off', () => {
	const a = new Node('A', 4n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1], undefined, undefined, {
		retainHistory: false,
	});
	while (sim.step());
	// The full trajectory is not retained, so iterating it is not meaningful.
	expect(() => sim.forEachStep(() => {})).toThrow();
	// The endpoints remain reachable directly.
	expect(sim.getStartStep().getSpeciesCounts()).toEqual([4n]);
	expect(sim.getLastStep().getSpeciesCounts()).toEqual([0n]);
});

test('onStep hands each listener call an independent counts copy', () => {
	const a = new Node('A', 3n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const captured: bigint[][] = [];
	const sim = new GillespieSimulator([a], [r1], undefined, undefined, {
		onStep: (s, counts) => {
			// The handed vector matches the step's own state at fire time.
			expect(counts).toEqual(s.getSpeciesCounts());
			captured.push(counts);
			// Trash it: because it is a copy (not the live currentCounts), this must
			// not corrupt the running simulation.
			counts.fill(-999n);
		},
	});
	while (sim.step());
	// Despite the listener trashing every vector it received, the trajectory is
	// intact - proof the listener got copies, not the live state.
	expect(sim.getStartStep().getSpeciesCounts()).toEqual([3n]);
	expect(sim.getLastStep().getSpeciesCounts()).toEqual([0n]);
	// Each callback received a distinct array instance (start + 3 decays).
	expect(captured.length).toBe(4);
	expect(new Set(captured).size).toBe(4);
});

test('history retention does not change the trajectory', () => {
	const build = (retain: boolean) => {
		const a = new Node('A', 15n);
		const b = new Node('B', 0n);
		const r1 = new Reaction(
			'A->B',
			[{node: a, amount: 1n}],
			[{node: b, amount: 1n}],
			Decimal(2)
		);
		const times: string[] = [];
		const sim = new GillespieSimulator(
			[a, b],
			[r1],
			new Xorshift128Plus(9n),
			undefined,
			{retainHistory: retain, onStep: (s) => times.push(s.time.toString())}
		);
		while (sim.step());
		return {times, last: sim.getLastStep().getSpeciesCounts()};
	};
	const on = build(true);
	const off = build(false);
	expect(off.times).toEqual(on.times);
	expect(off.last).toEqual(on.last);
});

test('a species added mid-run reconstructs as 0 before it existed', () => {
	const a = new Node('A', 5n);
	const r1 = new Reaction('A->', [{node: a, amount: 1n}], []);
	const sim = new GillespieSimulator([a], [r1]);
	sim.step(); // idx 1: A = 4
	sim.step(); // idx 2: A = 3
	const b = new Node('B', 99n);
	sim.addNode(b); // late add; startCount is ignored, back-filled as 0n
	// Earlier steps now reconstruct with B = 0n (generation bump kept caches sane).
	expect(sim.getStartStep().getSpeciesCounts()).toEqual([5n, 0n]);
	expect(sim.getCountsAt(1)).toEqual([4n, 0n]);
	sim.inject([{node: b, amount: 2n}], null); // idx 3
	expect(sim.getLastStep().getSpeciesCounts()).toEqual([3n, 2n]);
	// The step right before the injection still shows B = 0n.
	const injectIndex = sim.getStepCount() - 1;
	expect(sim.getCountsAt(injectIndex - 1)).toEqual([3n, 0n]);
});
