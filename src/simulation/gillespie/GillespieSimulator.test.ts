import {beforeEach, expect, test} from 'vitest';
import {Reaction} from '../../model/gillespie/Reaction';
import {Node} from '../../model/gillespie/Node';
import {GillespieSimulator} from './GillespieSimulator';

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
