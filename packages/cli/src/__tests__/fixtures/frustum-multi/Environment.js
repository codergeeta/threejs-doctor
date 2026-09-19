import { Mesh, MeshStandardMaterial } from 'three'

const forest = new Mesh(undefined, new MeshStandardMaterial())
forest.frustumCulled = false
const trees = new Mesh(undefined, new MeshStandardMaterial())
trees.frustumCulled = false
