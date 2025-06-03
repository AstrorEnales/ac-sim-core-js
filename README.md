# AC Sim Core [js]

This project is a library of different simulation methods.

The following simulators are currently available:

* Petri Net (extended, timed, functional, stochastic, discrete, capacities)
* Gillespie

## Usage

### Petri Net
A simple Petri net with two places connected via a transition can be setup as follows:

```ts
import {simulation, model} from 'ac-sim-core-js';

const p1 = new model.petrinet.DiscretePlace('p1');
p1.tokenStart = 1n;
const p2 = new model.petrinet.DiscretePlace('p2');
const t1 = new model.petrinet.DiscreteTransition('t1');

const arc1 = new model.petrinet.Arc(
    model.petrinet.ArcType.Regular,
    { from: p1, to: t1 }
);
const arc2 = new model.petrinet.Arc(
    model.petrinet.ArcType.Regular,
    { from: t1, to: p2 }
);

const simulator = new simulation.petrinet.DiscreteSimulator(
    [t1, p1, p2], // All nodes (places, transitions) in the net
    [arc1, arc2] // All arcs in the net
);
```

The simulation is run step by step with an optional limiting end time.

```ts
// Run one step:
simulator.step();

// Run one step unless it exceeds the time point 10:
simulator.step(10);
```


### Gillespie
A simple chemical reaction network with dimer formation and dissociation reactions ($A + B \rightarrow AB$, $AB \rightarrow A + B$) can be setup as follows:

```ts
import {simulation, model} from 'ac-sim-core-js';

const a = new model.gillespie.Node('A', 10n);
const b = new model.gillespie.Node('B', 10n);
const ab = new model.gillespie.Node('AB', 0n);

const formation = new model.gillespie.Reaction(
    'A + B -> AB',
    [
        {node: a, amount: 1n},
        {node: b, amount: 1n},
    ],
    [{node: ab, amount: 1n}]
);
const dissociation = new model.gillespie.Reaction(
    'AB -> A + B',
    [{node: ab, amount: 1n}],
    [
        {node: a, amount: 1n},
        {node: b, amount: 1n},
    ]
);

const simulator = new simulation.gillespie.GillespieSimulator(
    [a, b, ab], // All chemical species in the net
    [formation, dissociation] // All reactions in the net
);
```

The simulation is run step by step with an optional limiting end time.

```ts
// Run one step:
simulator.step();

// Run one step unless it exceeds the time point 10:
simulator.step(10);
```
