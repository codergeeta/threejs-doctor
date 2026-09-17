export const PACKAGE_NAME = '@threejs-doctor/cli' as const

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  void argv
  console.log('threejs-doctor: scaffold stub')
  return 0
}
