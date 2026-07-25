# Flow Math Visual Course Specification

## Scope

The built-in visual course is an original Flow Math learning path. It begins
with systems and vectors, builds the core structures of linear algebra in
dependency order, and ends with computational and optimization applications.
The course is authored directly in the app's own notebook language and visual
teaching grammar.

The eight outer units keep the curriculum navigable without turning the panel
into a flat preset list. Each unit exposes short, editable notebook stories that
run through the normal parser and playback engine.

## Curriculum Map

| Unit | Theme | Visual notebook focus |
| --- | --- | --- |
| 1 | Matrices and Gaussian elimination | row/column pictures, elimination, matrix columns, LU, inverse |
| 2 | Vector spaces and transformations | vectors, combinations, independence, bases, column/null space, linear transforms |
| 3 | Orthogonality and approximation | dot products, projection, least-squares residual |
| 4 | Determinants | signed area, rank loss, determinant as area scale |
| 5 | Eigenvalues and eigenvectors | invariant directions and diagonalization |
| 6 | Positive definite matrices and SVD | quadratic energy and SVD as rotate-scale-rotate |
| 7 | Matrix computation and stability | conditioning, sensitivity, and iterative direction convergence |
| 8 | Optimization and game theory | constraint vertices and mixed-strategy payoff balance |

## Lesson Shape

- Every lesson is short enough to edit after insertion.
- A visible operation is introduced before it moves, then followed by the
  mathematical observation.
- Graph-native concepts use vectors, lines, planes, grids, measurements, and
  matrix deformation.
- Symbolic matrix algorithms such as elimination, LU, and diagonalization use
  `field board` and visible matrix products rather than pretending they are
  coordinate geometry.
- Gaussian-elimination lessons express each step as one elementary matrix times
  the current coefficient matrix. The board engine supplies row/cell
  choreography from that canonical product; lesson scripts do not duplicate the
  result matrix or restage the automatic calculation. Public `mark ...` commands
  may identify one row before the operation or the final staircase afterward
  when that exact substructure is the teaching claim.
- Later computational and application units are condensed to one or two strong
  visual mechanisms instead of dense symbolic surveys.
- The positive-definite lesson keeps the sampled source vector visible while a
  separate `Ax` is created and compared with it. That sample illustrates one
  energy value only; the lesson then moves to the board and proves the
  all-directions claim with a completed-square quadratic form.
- The final evidence remains visible. A lesson does not add a trailing generic
  checkpoint or cleanup scene.

## Navigation

- The course is labeled as a Flow Math visual course in every locale. It does
  not display an author, publication, edition, chapter source, section range, or
  external curriculum attribution.
- Exactly one unit accordion may be open at a time.
- Each unit row shows its localized number, title, and a one-sentence learning
  summary.
- The open unit shows only that summary and local lesson numbers such as `1.1`
  or `6.2`.
- Each lesson button loads an ordinary editable notebook through the existing
  preset path.

## Ownership

- `src/notebook/lessonExamples.js` owns the reusable foundational stories.
- `src/notebook/visualCourse.js` owns unit composition, supplementary stories,
  summaries, and localization.
- `src/App.jsx` only renders the course data and invokes the normal notebook
  preset action.
