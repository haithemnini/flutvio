/**
 * src/main/fileService.ts
 * Flutvio — File Service (Phase 2 — Monaco Editor integration)
 *
 * TODO (Phase 2):
 *   - readFile(path): string
 *   - writeFile(path, content): void
 *   - watchFile(path, callback): () => void  — triggers Hot Reload on save
 *   - listDartFiles(projectPath): string[]
 */

export class FileService {
  async readFile(_path: string): Promise<string> {
    throw new Error('FileService: not implemented yet (Phase 2)')
  }

  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error('FileService: not implemented yet (Phase 2)')
  }
}

export const fileService = new FileService()
