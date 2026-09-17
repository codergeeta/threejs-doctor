#!/usr/bin/env node
import('../dist/index.js')
  .then((mod) => mod.main())
  .then((code) => {
    process.exit(typeof code === 'number' ? code : 0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
