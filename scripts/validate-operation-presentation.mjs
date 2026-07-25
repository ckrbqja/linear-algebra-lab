import assert from 'node:assert/strict';
import { buildNotebookOperationPresentation } from '../src/notebook/operationPresentation.js';

assert.deepEqual(
  buildNotebookOperationPresentation({
    type: 'calc',
    operation: 'product',
    left: 'E',
    right: 'A',
    name: 'U',
  }),
  {
    kind: 'calculation',
    labelKey: 'notebookCalculationInProgress',
    math: '{{E}} × {{A}} → {{U}}',
  }
);

assert.deepEqual(
  buildNotebookOperationPresentation({ type: 'scene', command: 'orbit' }),
  {
    kind: 'camera',
    labelKey: 'notebookOrbitInProgress',
    math: '360°',
  }
);

assert.equal(
  buildNotebookOperationPresentation({
    type: 'calc',
    operation: 'linearCombination',
    name: 'result',
    terms: [
      { scalar: 2, name: 'c1' },
      { scalar: -1, name: 'c2' },
    ],
  })?.math,
  '2 × {{c1}} − {{c2}} → {{result}}'
);

assert.deepEqual(
  buildNotebookOperationPresentation({
    type: 'measurement',
    measureType: 'det',
    names: ['v1', 'v2'],
  }),
  {
    kind: 'measurement',
    labelKey: 'notebookMeasurementInProgress',
    math: 'det({{v1}}, {{v2}})',
  }
);

assert.equal(
  buildNotebookOperationPresentation({ type: 'calc', hidden: true }),
  null,
  'hidden operations must not open the scene HUD'
);

console.log('Current-operation presentation validation passed.');
