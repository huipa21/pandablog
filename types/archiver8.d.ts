// Installed Archiver 8 exports classes, not the factory modeled by @types 7.
// Reuse its stream/options interfaces while declaring the verified runtime API.
import type { Archiver, ArchiverOptions } from 'archiver'
declare module 'archiver' {
  export const ZipArchive: { new(options?: ArchiverOptions): Archiver }
}
