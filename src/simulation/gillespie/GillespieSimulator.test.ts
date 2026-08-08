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
	expect(steps[1].speciesCounts[0]).toBe(0n);
	expect(steps[1].speciesCounts[1]).toBe(0n);
	expect(steps[1].speciesCounts[2]).toBe(1n);
});

test('inputOnlyReaction', () => {
	const a = new Node('A', 10n);
	const r1 = new Reaction('destroy', [{node: a, amount: 2n}], []);
	const simulator = new GillespieSimulator([a], [r1]);
	while (simulator.step());
	const steps = simulator.getSteps();
	expect(steps.length).toBe(6);
	expect(steps[0].speciesCounts[0]).toBe(10n);
	expect(steps[1].speciesCounts[0]).toBe(8n);
	expect(steps[2].speciesCounts[0]).toBe(6n);
	expect(steps[3].speciesCounts[0]).toBe(4n);
	expect(steps[4].speciesCounts[0]).toBe(2n);
	expect(steps[5].speciesCounts[0]).toBe(0n);
});

test('addNode appends a new species to existing steps', () => {
	const a = new Node('A', 10n);
	const simulator = new GillespieSimulator([a], []);
	const b = new Node('B', 5n);
	simulator.addNode(b);
	expect(simulator.getNodes()).toContain(b);
	// Existing steps are back-filled with 0n; the late node's startCount is ignored.
	expect(simulator.getStartStep().speciesCounts).toEqual([10n, 0n]);
});

test('addNode is idempotent for an existing node', () => {
	const a = new Node('A', 10n);
	const simulator = new GillespieSimulator([a], []);
	simulator.addNode(a);
	expect(simulator.getNodes().length).toBe(1);
	expect(simulator.getStartStep().speciesCounts).toEqual([10n]);
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
	expect(last.speciesCounts[0]).toBe(9n); // A
	expect(last.speciesCounts[1]).toBe(1n); // C
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
	expect(last.speciesCounts[0]).toBe(1n); // A
	expect(last.speciesCounts[1]).toBe(2n); // X
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
	const counts = simulator.getLastStep().speciesCounts;
	expect(counts[0]).toBe(0n); // A
	expect(counts[1]).toBe(0n); // B
	expect(counts[2]).toBe(10n); // C
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
	//simulator.getNodes().forEach((n, i) => {
	//	console.log(n.name, steps.map((s) => s.speciesCounts[i]).join(', '));
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
		expect(dynamicSteps[i].speciesCounts).toEqual(fixedSteps[i].speciesCounts);
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
	const counts = simulator.getLastStep().speciesCounts;
	expect(counts[0]).toBe(0n); // A
	expect(counts[1]).toBe(0n); // B
	expect(counts[2]).toBe(50n); // C
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
	const counts = simulator.getLastStep().speciesCounts;
	expect(counts[0]).toBe(0n);
	expect(counts[1]).toBe(40n);
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
	const counts = simulator.getLastStep().speciesCounts;
	// If the stale zero propensity were never refreshed, A would never convert.
	expect(counts[2]).toBe(0n); // A fully consumed
	expect(counts[3]).toBe(5n); // all A became Z
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
		expect(explicitSteps[i].speciesCounts).toEqual(
			implicitSteps[i].speciesCounts
		);
		expect(explicitSteps[i].time.toString()).toBe(
			implicitSteps[i].time.toString()
		);
	}
});
