import { Mesh, MeshBasicMaterial } from 'three'

const ribbon = new Mesh(undefined, new MeshBasicMaterial())
ribbon.frustumCulled = false
