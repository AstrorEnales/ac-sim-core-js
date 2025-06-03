import {test, expect, beforeEach} from 'vitest';
import {DiscretePlace} from '../../model/petrinet/DiscretePlace';
import {DiscreteSimulator, Marking} from './DiscreteSimulator';
import {DiscreteTransition} from '../../model/petrinet/DiscreteTransition';
import {Arc} from '../../model/petrinet/Arc';
import {ArcType} from '../../model/petrinet/ArcType';
import {ConflictHandling} from '../../model/petrinet/ConflictHandling';
import {Xorshift128Plus} from '../../random/Xorshift128Plus';
import {Parameter} from '../../model/petrinet/Parameter';
import Decimal from 'decimal.js';
import {Place} from '../../model/petrinet/Place';
import {Transition} from '../../model/petrinet/Transition';

beforeEach(() => {
	(Transition as any).ID_COUNTER = 0;
	(Place as any).ID_COUNTER = 0;
	(Arc as any).ID_COUNTER = 0;
});

function assertPlaceTokensTimeline(
	simulator: DiscreteSimulator,
	markingTimeline: Marking[],
	p: DiscretePlace,
	expectedTokens: bigint[]
) {
	const actualTokens = [];
	for (let i = 0; i < markingTimeline.length; i++) {
		actualTokens.push(simulator.getTokens(markingTimeline[i], p));
	}
	expect(expectedTokens).toEqual(actualTokens);
}

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/SinglePD.mo
test('pnlibSinglePD', () => {
	const p1 = new DiscretePlace('p1');
	const simulator = new DiscreteSimulator([p1], []);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(1);
	expect(simulator.getMaxTime().isZero()).toBeTruthy();
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/SingleTD.mo
test('pnlibSingleTD', () => {
	const t1 = new DiscreteTransition('t1');
	const simulator = new DiscreteSimulator([t1], []);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(11);
	expect(simulator.getMaxTime().equals(10)).toBeTruthy();
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/PDtoTD.mo
test('pnlibPDtoTD', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const simulator = new DiscreteSimulator([p1, t1], [arc1]);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(11);
	expect(simulator.getMaxTime().equals(10)).toBeTruthy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		10n,
		9n,
		8n,
		7n,
		6n,
		5n,
		4n,
		3n,
		2n,
		1n,
		0n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/PDtoTDfunction.mo
test('pnlibPDtoTDfunction', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, 'p1');
	const simulator = new DiscreteSimulator([p1, t1], [arc1]);
	for (let i = 0; i < 4; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		10n,
		0n,
		0n,
		0n,
		0n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/TDtoPD.mo
test('pnlibTDtoPD', () => {
	const p1 = new DiscretePlace('p1');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1});
	const simulator = new DiscreteSimulator([p1, t1], [arc1]);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(11);
	expect(simulator.getMaxTime().equals(10)).toBeTruthy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		0n,
		1n,
		2n,
		3n,
		4n,
		5n,
		6n,
		7n,
		8n,
		9n,
		10n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/TDtoPDfunction.mo
test('pnlibTDtoPDfunction', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 1n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1}, 'p1');
	const simulator = new DiscreteSimulator([p1, t1], [arc1]);
	for (let i = 0; i < 4; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		1n,
		2n,
		4n,
		8n,
		16n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/DisLoopAndArcweight.mo
test('pnlibDisLoopAndArcweight', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 2n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '2');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p1}, '3');
	const simulator = new DiscreteSimulator([p1, t1], [arc1, arc2]);
	for (let i = 0; i < 4; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		2n,
		3n,
		4n,
		5n,
		6n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/NoInputConflict.mo
test('pnlibNoInputConflict', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenMax = 1n;
	p1.conflictStrategy = ConflictHandling.Priority;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	t2.delay = '2';
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1});
	arc1.priority = 2;
	const arc2 = new Arc(ArcType.Regular, {from: t2, to: p1});
	arc2.priority = 1;
	const simulator = new DiscreteSimulator([p1, t1, t2], [arc1, arc2]);
	while (!simulator.isDead) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(2);
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [0n, 1n]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/PrioTest.mo
test('pnlibPrioTest', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 1n;
	p1.conflictStrategy = ConflictHandling.Priority;
	const p2 = new DiscretePlace('p2');
	p2.tokenMax = 1n;
	const p3 = new DiscretePlace('p3');
	p3.tokenMax = 1n;
	const p4 = new DiscretePlace('p4');
	p4.tokenMax = 1n;
	const p5 = new DiscretePlace('p5');
	p5.tokenMax = 1n;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const t4 = new DiscreteTransition('t4');
	const t5 = new DiscreteTransition('t5');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc2.priority = 4;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t3});
	arc3.priority = 3;
	const arc4 = new Arc(ArcType.Regular, {from: p1, to: t4});
	arc4.priority = 2;
	const arc5 = new Arc(ArcType.Regular, {from: p1, to: t5});
	arc5.priority = 1;
	const arc6 = new Arc(ArcType.Regular, {from: t2, to: p2});
	const arc7 = new Arc(ArcType.Regular, {from: t3, to: p3});
	const arc8 = new Arc(ArcType.Regular, {from: t4, to: p4});
	const arc9 = new Arc(ArcType.Regular, {from: t5, to: p5});
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3, t4, p4, t5, p5],
		[arc1, arc2, arc3, arc4, arc5, arc6, arc7, arc8, arc9]
	);
	for (let i = 0; i < 5; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(simulator.getTokens(markingTimeline[1], p5)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[2], p4)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[3], p3)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[4], p2)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[5], p1)).toBe(2n);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/ConflictPrio.mo
test('pnlibConflictPrio', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 2n;
	p1.conflictStrategy = ConflictHandling.Priority;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: t3, to: p1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc2.priority = 1;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc3.priority = 2;
	const arc4 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc5 = new Arc(ArcType.Regular, {from: t2, to: p3});
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5]
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		2n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		0n,
		1n,
		2n,
		3n,
		4n,
		5n,
		6n,
		7n,
		8n,
		9n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		0n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/OutputConflictPrio.mo
test('pnlibOutputConflictPrio', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 2n;
	p1.tokenMin = 2n;
	p1.conflictStrategy = ConflictHandling.Priority;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: t3, to: p1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc2.priority = 1;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc3.priority = 2;
	const arc4 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc5 = new Arc(ArcType.Regular, {from: t2, to: p3});
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5]
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		2n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		0n,
		0n,
		1n,
		2n,
		3n,
		4n,
		5n,
		6n,
		7n,
		8n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		0n,
		0n,
		0n,
		0n,
		0n,
		0n,
		0n,
		0n,
		0n,
		0n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/InputConflictPrio.mo
test('pnlibInputConflictPrio', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenMax = 2n;
	p1.conflictStrategy = ConflictHandling.Priority;
	const p2 = new DiscretePlace('p2');
	p2.tokenStart = 5n;
	const p3 = new DiscretePlace('p3');
	p3.tokenStart = 5n;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const arc2 = new Arc(ArcType.Regular, {from: p2, to: t2});
	const arc3 = new Arc(ArcType.Regular, {from: p3, to: t3});
	const arc4 = new Arc(ArcType.Regular, {from: t2, to: p1});
	arc4.priority = 1;
	const arc5 = new Arc(ArcType.Regular, {from: t3, to: p1});
	arc5.priority = 2;
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5]
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		0n,
		2n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		5n,
		4n,
		4n,
		3n,
		2n,
		1n,
		0n,
		0n,
		0n,
		0n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		5n,
		4n,
		4n,
		4n,
		4n,
		4n,
		4n,
		3n,
		2n,
		1n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/ConflictProb.mo
test('pnlibConflictProb', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 2n;
	p1.conflictStrategy = ConflictHandling.Probability;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: t3, to: p1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc2.probability = 0.5;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc3.probability = 0.5;
	const arc4 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc5 = new Arc(ArcType.Regular, {from: t2, to: p3});
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5],
		new Xorshift128Plus(42n)
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		2n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		0n,
		1n,
		2n,
		3n,
		4n,
		4n,
		5n,
		6n,
		7n,
		7n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		0n,
		1n,
		1n,
		1n,
		1n,
		2n,
		2n,
		2n,
		2n,
		3n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/OutputConflictProb.mo
test('pnlibOutputConflictProb', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 2n;
	p1.tokenMin = 2n;
	p1.conflictStrategy = ConflictHandling.Probability;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: t3, to: p1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc2.probability = 0.5;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc3.probability = 0.5;
	const arc4 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc5 = new Arc(ArcType.Regular, {from: t2, to: p3});
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5],
		new Xorshift128Plus(42n)
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		2n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
		3n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		0n,
		0n,
		1n,
		2n,
		3n,
		3n,
		4n,
		5n,
		6n,
		6n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		0n,
		0n,
		0n,
		0n,
		0n,
		1n,
		1n,
		1n,
		1n,
		2n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/InputConflictProb.mo
test('pnlibInputConflictProb', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenMax = 2n;
	p1.conflictStrategy = ConflictHandling.Probability;
	const p2 = new DiscretePlace('p2');
	p2.tokenStart = 5n;
	const p3 = new DiscretePlace('p3');
	p3.tokenStart = 5n;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const arc2 = new Arc(ArcType.Regular, {from: p2, to: t2});
	const arc3 = new Arc(ArcType.Regular, {from: p3, to: t3});
	const arc4 = new Arc(ArcType.Regular, {from: t2, to: p1});
	arc4.probability = 0.5;
	const arc5 = new Arc(ArcType.Regular, {from: t3, to: p1});
	arc5.probability = 0.5;
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, p2, t3, p3],
		[arc1, arc2, arc3, arc4, arc5],
		new Xorshift128Plus(42n)
	);
	for (let i = 0; i < 9; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		0n,
		2n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
		1n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		5n,
		4n,
		4n,
		3n,
		2n,
		1n,
		1n,
		0n,
		0n,
		0n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p3, [
		5n,
		4n,
		4n,
		4n,
		4n,
		4n,
		3n,
		3n,
		2n,
		1n,
	]);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/SixConflictProb.mo
test('pnlibSixConflictProb', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 1n;
	p1.conflictStrategy = ConflictHandling.Probability;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const t4 = new DiscreteTransition('t4');
	const t5 = new DiscreteTransition('t5');
	const t6 = new DiscreteTransition('t6');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc1.probability = 1.0 / 6.0;
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc2.probability = 1.0 / 6.0;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t3});
	arc3.probability = 1.0 / 6.0;
	const arc4 = new Arc(ArcType.Regular, {from: p1, to: t4});
	arc4.probability = 1.0 / 6.0;
	const arc5 = new Arc(ArcType.Regular, {from: p1, to: t5});
	arc5.probability = 1.0 / 6.0;
	const arc6 = new Arc(ArcType.Regular, {from: p1, to: t6});
	arc6.probability = 1.0 / 6.0;
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, t3, t4, t5, t6],
		[arc1, arc2, arc3, arc4, arc5, arc6],
		new Xorshift128Plus(42n)
	);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [1n, 0n]);
	expect(simulator.getEdges()[0].transitions.length).toBe(1);
	expect(simulator.getEdges()[0].transitions[0].transition).toBe(t2);
});

// Equivalent to https://github.com/AMIT-HSBI/PNlib/blob/master/PNlib/Examples/DisTest/EightConflictProb.mo
test('pnlibEightConflictProb', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 1n;
	p1.conflictStrategy = ConflictHandling.Probability;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const t4 = new DiscreteTransition('t4');
	const t5 = new DiscreteTransition('t5');
	const t6 = new DiscreteTransition('t6');
	const t7 = new DiscreteTransition('t7');
	const t8 = new DiscreteTransition('t8');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	arc1.probability = 1.0 / 8.0;
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t2});
	arc2.probability = 1.0 / 8.0;
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t3});
	arc3.probability = 1.0 / 8.0;
	const arc4 = new Arc(ArcType.Regular, {from: p1, to: t4});
	arc4.probability = 1.0 / 8.0;
	const arc5 = new Arc(ArcType.Regular, {from: p1, to: t5});
	arc5.probability = 1.0 / 8.0;
	const arc6 = new Arc(ArcType.Regular, {from: p1, to: t6});
	arc6.probability = 1.0 / 8.0;
	const arc7 = new Arc(ArcType.Regular, {from: p1, to: t7});
	arc7.probability = 1.0 / 8.0;
	const arc8 = new Arc(ArcType.Regular, {from: p1, to: t8});
	arc8.probability = 1.0 / 8.0;
	const simulator = new DiscreteSimulator(
		[t1, p1, t2, t3, t4, t5, t6, t7, t8],
		[arc1, arc2, arc3, arc4, arc5, arc6, arc7, arc8],
		new Xorshift128Plus(42n)
	);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [1n, 0n]);
	expect(simulator.getEdges()[0].transitions.length).toBe(1);
	expect(simulator.getEdges()[0].transitions[0].transition).toBe(t3);
});

test('singleTransition', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 1n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	expect(simulator.getMarkings().length).toBe(1);
	expect(simulator.getEdges().length).toBe(0);
	simulator.step();
	expect(simulator.getMarkings().length).toBe(2);
	expect(simulator.getEdges().length).toBe(1);
	expect(simulator.getEdges()[0].transitions[0].transition).toBe(t1);
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeTruthy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [1n, 0n]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [0n, 1n]);
});

test('singleTransitionRepeatedFire', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '1');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, '2');
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	expect(simulator.getMarkings().length).toBe(11);
	expect(simulator.getEdges().length).toBe(10);
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[markingTimeline.length - 1].isDead).toBeTruthy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [
		10n,
		9n,
		8n,
		7n,
		6n,
		5n,
		4n,
		3n,
		2n,
		1n,
		0n,
	]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [
		0n,
		2n,
		4n,
		6n,
		8n,
		10n,
		12n,
		14n,
		16n,
		18n,
		20n,
	]);
});

test('singleTransitionWithArcFunctions', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '1 + 2');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, '2 + 3');
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBeGreaterThan(1);
	expect(markingTimeline[1].isDead).toBeFalsy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [10n, 7n]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [0n, 5n]);
});

test('singleTransitionWithArcFunctionsAndParameter', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '1 + k');
	arc1.parameters.push(new Parameter('k', Decimal(2)));
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, 'm + 3');
	arc2.parameters.push(new Parameter('m', Decimal(2)));
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBeGreaterThan(1);
	expect(markingTimeline[1].isDead).toBeFalsy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [10n, 7n]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [0n, 5n]);
});

test('singleTransitionWithArcFunctionsAndVariable', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	p3.tokenStart = 2n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '1 + p3');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, 'p3 + 3');
	const simulator = new DiscreteSimulator([t1, p1, p2, p3], [arc1, arc2]);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBeGreaterThan(1);
	expect(markingTimeline[1].isDead).toBeFalsy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [10n, 7n]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [0n, 5n]);
});

test('singleTransitionWithDelayFunction', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const t1 = new DiscreteTransition('t1');
	t1.delay = '1 + 2';
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	simulator.step();
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBeGreaterThan(1);
	expect(markingTimeline[0].time).toEqual(Decimal(0));
	expect(markingTimeline[1].time).toEqual(Decimal(3));
	expect(markingTimeline[2].time).toEqual(Decimal(6));
});

test('singleTransitionAssuringNonNegativeArcWeights', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 4n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, '1 - p2');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	simulator.step();
	simulator.step();
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(3);
	expect(markingTimeline[1].isDead).toBeFalsy();
	expect(markingTimeline[2].isDead).toBeTruthy();
	expect(simulator.getTokens(markingTimeline[2], p1)).toBe(3n);
	expect(simulator.getTokens(markingTimeline[2], p2)).toBe(2n);
});

test('activatingSingleTransitionNoPrePlace', () => {
	const p1 = new DiscretePlace('p1');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1});
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	simulator.step();
	simulator.step();
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBeGreaterThan(1);
	expect(markingTimeline[3].isDead).toBeFalsy();
	expect(simulator.getTokens(markingTimeline[0], p1)).toBe(0n);
	expect(simulator.getTokens(markingTimeline[3], p1)).toBe(3n);
});

test('divisionByZeroThrowsException', () => {
	const p1 = new DiscretePlace('p1');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1}, '1/0');
	expect(() => new DiscreteSimulator([t1, p1], [arc1])).toThrow(
		"Failed to evaluate function for arc '1' from 't1' to 'p1': 1/0"
	);
});

test('singleTransitionWithMinCapacity', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	p1.tokenMin = 8n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	for (let i = 0; i < 2; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeFalsy();
	expect(markingTimeline[2].isDead).toBeTruthy();
	expect(simulator.getTokens(markingTimeline[1], p1)).toBe(9n);
	expect(simulator.getTokens(markingTimeline[2], p1)).toBe(8n);
});

test('singleTransitionWithMaxCapacity', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenMax = 2n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: t1, to: p1});
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	for (let i = 0; i < 2; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeFalsy();
	expect(markingTimeline[2].isDead).toBeTruthy();
	expect(simulator.getTokens(markingTimeline[1], p1)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[2], p1)).toBe(2n);
});

test('singleTransitionWithConstantPlaces', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	p1.isConstant = true;
	const p2 = new DiscretePlace('p2');
	p2.tokenStart = 4n;
	p2.isConstant = true;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	for (let i = 0; i < 10; i++) {
		simulator.step();
	}
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline.length).toBe(11);
	markingTimeline.forEach((marking) => {
		expect(marking.isDead).toBeFalsy();
		expect(simulator.getTokens(marking, p1)).toBe(10n);
		expect(simulator.getTokens(marking, p2)).toBe(4n);
	});
});

test('singleTransitionWithTestArcTooFewTokens', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 9n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Test, {from: p1, to: t1}, '10');
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	expect(simulator.getStartMarking().isDead).toBeTruthy();
});

test('singleTransitionWithTestArcEnoughTokens', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Test, {from: p1, to: t1}, '10');
	const simulator = new DiscreteSimulator([t1, p1], [arc1]);
	simulator.step();
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeFalsy();
	expect(markingTimeline[2].isDead).toBeFalsy();
});

test('singleTransitionWithInhibitionArcTooFewTokens', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 9n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Inhibition, {from: p1, to: t1}, '10');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, '1');
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	simulator.step();
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeFalsy();
	expect(markingTimeline[2].isDead).toBeFalsy();
	assertPlaceTokensTimeline(simulator, markingTimeline, p1, [9n, 9n, 9n]);
	assertPlaceTokensTimeline(simulator, markingTimeline, p2, [0n, 1n, 2n]);
});

test('singleTransitionWithInhibitionArcEnoughTokens', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 10n;
	const p2 = new DiscretePlace('p2');
	const t1 = new DiscreteTransition('t1');
	const arc1 = new Arc(ArcType.Inhibition, {from: p1, to: t1}, '10');
	const arc2 = new Arc(ArcType.Regular, {from: t1, to: p2}, '1');
	const simulator = new DiscreteSimulator([t1, p1, p2], [arc1, arc2]);
	expect(simulator.getStartMarking().isDead).toBeTruthy();
});

/**
 * The idea of this test is that four transitions all gain concession at time=0 with a delay of 1 each.
 * As they retain concession at each step, all four transitions must have fired after four simulation steps and
 * p2-p5 must have gained one token each.
 */
test('transitionsWithSameDelayAllFire', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 4n;
	const p2 = new DiscretePlace('p2');
	const p3 = new DiscretePlace('p3');
	const p4 = new DiscretePlace('p4');
	const p5 = new DiscretePlace('p5');
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const t4 = new DiscreteTransition('t4');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1});
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t2});
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t3});
	const arc4 = new Arc(ArcType.Regular, {from: p1, to: t4});
	const arc5 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc6 = new Arc(ArcType.Regular, {from: t2, to: p3});
	const arc7 = new Arc(ArcType.Regular, {from: t3, to: p4});
	const arc8 = new Arc(ArcType.Regular, {from: t4, to: p5});
	const simulator = new DiscreteSimulator(
		[t1, t2, t3, t4, p1, p2, p3, p4, p5],
		[arc1, arc2, arc3, arc4, arc5, arc6, arc7, arc8]
	);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(markingTimeline[0].isDead).toBeFalsy();
	expect(markingTimeline[1].isDead).toBeTruthy();
	expect(simulator.getTokens(markingTimeline[1], p1)).toBe(0n);
	expect(simulator.getTokens(markingTimeline[1], p2)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[1], p3)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[1], p4)).toBe(1n);
	expect(simulator.getTokens(markingTimeline[1], p5)).toBe(1n);
});

test('arcsRetainWeightsWithSameDelay', () => {
	const p1 = new DiscretePlace('p1');
	p1.tokenStart = 4n;
	const p2 = new DiscretePlace('p2');
	p2.tokenStart = 1n;
	const t1 = new DiscreteTransition('t1');
	const t2 = new DiscreteTransition('t2');
	const t3 = new DiscreteTransition('t3');
	const arc1 = new Arc(ArcType.Regular, {from: p1, to: t1}, 'p2');
	const arc2 = new Arc(ArcType.Regular, {from: p1, to: t2}, 'p2');
	const arc3 = new Arc(ArcType.Regular, {from: p1, to: t3}, 'p2');
	const arc4 = new Arc(ArcType.Regular, {from: t1, to: p2});
	const arc5 = new Arc(ArcType.Regular, {from: t2, to: p2});
	const arc6 = new Arc(ArcType.Regular, {from: t3, to: p2});
	const simulator = new DiscreteSimulator(
		[t1, t2, t3, p1, p2],
		[arc1, arc2, arc3, arc4, arc5, arc6]
	);
	simulator.step();
	const markingTimeline = simulator.getMarkingTimeline();
	expect(simulator.getTokens(markingTimeline[0], p1)).toBe(4n);
	expect(simulator.getTokens(markingTimeline[1], p1)).toBe(1n);
});
