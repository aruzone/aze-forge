/**
 * The reviewed sandbox argv the local and canonical TeX wrappers share. Every
 * entry is deployment configuration: author Source never contributes an
 * executable, an argv entry, a path, or a limit. The identity reaches the
 * adapter only through its fixed environment.
 */
export function dockerTexRendererArgs(image, rendererIdentity) {
  return [
    "run", "--rm", "--interactive", "--platform", "linux/amd64", "--network", "none", "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "512m", "--cpus", "1",
    "--env", `AZEFORGE_TEX_RENDERER_IDENTITY=${rendererIdentity}`,
    image,
  ];
}
