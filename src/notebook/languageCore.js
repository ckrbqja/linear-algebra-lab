export const NOTEBOOK_SCENE_DEFAULTS = Object.freeze({
  field: 'graph',
  dimension: '3d',
  view: '3d',
  axes: true,
  relativeAxes: true,
  grid: true,
  relativeGrid: false,
  coordinates: true,
  basis: false,
  vectors: true,
  zoom: 0.9,
});

export const NOTEBOOK_FIELD_MODE_ALIASES = Object.freeze({
  board: ['board', 'algebra', 'notes', '보드', '필기', '대수'],
  graph: ['graph', 'plot', '그래프', '좌표'],
});

export const NOTEBOOK_SCENE_TOGGLE_ALIASES = Object.freeze({
  axes: ['axes', 'axis', '축', '절대축'],
  relativeAxes: ['relative-axes', 'relative axes', 'relative-axis', '상대축'],
  grid: ['grid', '격자', '절대격자'],
  relativeGrid: ['relative-grid', 'relative grid', '상대격자'],
  coordinates: ['coordinates', 'coordinate', 'coords', '좌표'],
  basis: ['basis', '기저'],
  vectors: ['vectors', 'vector', '벡터'],
});

export const NOTEBOOK_BASIS_MEASUREMENT_TARGETS = Object.freeze({
  i: 'b:i',
  j: 'b:j',
  k: 'b:k',
});
