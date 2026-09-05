import { randomBytes } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function commitArtifact(
  artifactPath: string,
  bytes: Uint8Array,
): Promise<void> {
  const directory = dirname(artifactPath);
  const temporaryPath = join(
    directory,
    `.${basename(artifactPath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let temporaryFile;
  try {
    temporaryFile = await open(temporaryPath, "wx", 0o666);
    await temporaryFile.writeFile(bytes);
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await rename(temporaryPath, artifactPath);
  } catch (error) {
    if (temporaryFile !== undefined) await temporaryFile.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
