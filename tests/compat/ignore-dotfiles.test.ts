import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { glob as nodeGlob } from 'glob';
import { loadGloblin, createTestFixture, cleanupFixture, FixtureConfig } from '../harness';
import * as path from 'path';

/**
 * Task 4.4.1: Test ignore with dot files
 *
 * Key behavior:
 * - Ignore patterns always operate in dot: true mode internally
 * - Can ignore .hidden files even when the main dot option is false
 * - Ignore patterns can match dotfiles that the main pattern would skip
 */
describe('ignore option with dotfiles', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>>;
  let fixturePath: string;

  beforeAll(async () => {
    globlin = await loadGloblin();

    // Create a fixture with dotfiles and directories
    const config: FixtureConfig = {
      files: [
        'visible/a.txt',
        'visible/b.txt',
        '.hidden/a.txt',
        '.hidden/b.txt',
        '.dotfile',
        'dir/.config',
        'dir/.env',
        'dir/normal.txt',
        'nested/deep/.secret',
        'nested/visible.txt',
      ],
    };

    fixturePath = await createTestFixture('ignore-dotfiles-test', config);
  });

  afterAll(async () => {
    if (fixturePath) {
      await cleanupFixture(fixturePath);
    }
  });

  describe('ignore patterns can match dotfiles even with dot: false', () => {
    it('should ignore a dotfile even when dot: false (glob behavior)', async () => {
      // With dot: false, .dotfile is not matched by the pattern
      // But if it were, the ignore would apply
      const results = await globlin.glob('*', {
        cwd: fixturePath,
        dot: false,
        ignore: ['.dotfile'],
      });

      // .dotfile should not be in results (not matched due to dot: false)
      expect(results).not.toContain('.dotfile');
      expect(results).toContain('visible');
      expect(results).toContain('dir');
      expect(results).toContain('nested');
    });

    it('should ignore a dotfile pattern with dot: true', async () => {
      const results = await globlin.glob('*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['.dotfile'],
      });

      // .dotfile should be excluded by ignore pattern
      expect(results).not.toContain('.dotfile');
      // But .hidden should still be included
      expect(results).toContain('.hidden');
    });

    it('should ignore dotfiles matching a pattern', async () => {
      const results = await globlin.glob('**/*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['**/.*'],
      });

      // Files ending in dotname should be excluded (like .dotfile, .config, .env, .secret)
      // But .hidden/a.txt is NOT excluded because a.txt doesn't start with .
      expect(results).not.toContain('.dotfile');
      expect(results).not.toContain('dir/.config');
      expect(results).not.toContain('dir/.env');
      expect(results).not.toContain('nested/deep/.secret');

      // Files in hidden directories are still found (the ignore pattern doesn't match them)
      expect(results).toContain('.hidden/a.txt');
      expect(results).toContain('.hidden/b.txt');
    });
  });

  describe('ignore patterns operate in dot: true mode internally', () => {
    it('should match hidden directories with ignore pattern', async () => {
      const results = await globlin.glob('**/*.txt', {
        cwd: fixturePath,
        dot: false,
        ignore: ['.hidden/**'],
      });

      // With dot: false, .hidden files are not matched anyway
      // Verify visible files are found
      expect(results).toContain('visible/a.txt');
      expect(results).toContain('visible/b.txt');
    });

    it('should match hidden directories with ignore pattern when dot: true', async () => {
      const results = await globlin.glob('**/*.txt', {
        cwd: fixturePath,
        dot: true,
        ignore: ['.hidden/**'],
      });

      // .hidden/a.txt and .hidden/b.txt should be excluded by ignore
      expect(results).not.toContain('.hidden/a.txt');
      expect(results).not.toContain('.hidden/b.txt');
      // But visible files should still be found
      expect(results).toContain('visible/a.txt');
      expect(results).toContain('visible/b.txt');
    });

    it('should match files starting with dot in ignore patterns', async () => {
      const results = await globlin.glob('dir/*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['dir/.*'],
      });

      // .config and .env should be excluded by ignore
      expect(results).not.toContain('dir/.config');
      expect(results).not.toContain('dir/.env');
      // But normal.txt should be found
      expect(results).toContain('dir/normal.txt');
    });
  });

  describe('comparison with glob package', () => {
    it('should match glob behavior for ignore with dotfiles', async () => {
      const pattern = '**/*';
      const options = {
        cwd: fixturePath,
        dot: true,
        ignore: ['**/.*'],
      };

      const [globResults, globlinResults] = await Promise.all([
        nodeGlob(pattern, options),
        globlin.glob(pattern, options),
      ]);

      expect(new Set(globlinResults)).toEqual(new Set(globResults));
    });

    it('should match glob behavior for ignore hidden directory', async () => {
      const pattern = '**/*.txt';
      const options = {
        cwd: fixturePath,
        dot: true,
        ignore: ['.hidden/**'],
      };

      const [globResults, globlinResults] = await Promise.all([
        nodeGlob(pattern, options),
        globlin.glob(pattern, options),
      ]);

      expect(new Set(globlinResults)).toEqual(new Set(globResults));
    });

    it('should match glob behavior when ignoring dotfile in directory', async () => {
      const pattern = 'dir/*';
      const options = {
        cwd: fixturePath,
        dot: true,
        ignore: ['dir/.config'],
      };

      const [globResults, globlinResults] = await Promise.all([
        nodeGlob(pattern, options),
        globlin.glob(pattern, options),
      ]);

      expect(new Set(globlinResults)).toEqual(new Set(globResults));
    });
  });

  describe('sync API', () => {
    it('should work identically with globSync', () => {
      const pattern = '**/*';
      const options = {
        cwd: fixturePath,
        dot: true,
        ignore: ['**/.*'],
      };

      const globResults = nodeGlob.sync(pattern, options);
      const globlinResults = globlin.globSync(pattern, options);

      expect(new Set(globlinResults)).toEqual(new Set(globResults));
    });
  });

  describe('edge cases', () => {
    it('should handle ignore pattern that is just a dot', async () => {
      const results = await globlin.glob('**/*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['.'],
      });

      // The current directory "." should not appear in results
      // (it's not in a non-mark glob anyway with **/* pattern)
      expect(results.every((r) => r !== '.')).toBe(true);
    });

    it('should handle nested dotfile ignore patterns', async () => {
      const results = await globlin.glob('**/*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['**/.secret'],
      });

      // nested/deep/.secret should be excluded
      expect(results).not.toContain('nested/deep/.secret');
    });

    it('should handle multiple dotfile ignore patterns', async () => {
      const results = await globlin.glob('**/*', {
        cwd: fixturePath,
        dot: true,
        ignore: ['.dotfile', '.hidden/**', '**/.*'],
      });

      // .dotfile should be excluded
      expect(results).not.toContain('.dotfile');
      // .hidden directory and contents should be excluded
      expect(results.filter((r) => r.startsWith('.hidden'))).toHaveLength(0);
      // All dotfiles (files starting with .) should be excluded
      expect(results).not.toContain('dir/.config');
      expect(results).not.toContain('dir/.env');
      expect(results).not.toContain('nested/deep/.secret');
    });
  });
});
