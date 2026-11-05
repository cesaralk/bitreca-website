import test from 'node:test'
import assert from 'node:assert/strict'
import { readPublicProject, safeProjectUrl, validProjectSlug } from '../src/utils/publicProjects.js'

const project = { id: 1, slug: 'qa-project', title: 'Synthetic QA project', category: 'Fixture', description: 'Isolated test data, never published.' }

test('project URLs allow web links and root-relative images, never executable schemes or embedded credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'file:///tmp/image.png', '//evil.example/image.png', '/\\evil.example/image.png', 'https://name:password@example.com/', 'https://exam\nple.com/', {}, null]) {
    assert.equal(safeProjectUrl(value), '')
    assert.equal(safeProjectUrl(value, true), '')
  }
  assert.equal(safeProjectUrl('/api/media/project.png', true), '/api/media/project.png')
  assert.equal(safeProjectUrl('/api/media/project.png'), '')
  assert.equal(safeProjectUrl('https://example.com/project'), 'https://example.com/project')
  assert.equal(safeProjectUrl('http://example.com/project'), 'http://example.com/project')
})

test('public project validation rejects malformed API records instead of presenting them as published work', () => {
  for (const value of [null, [], {}, { ...project, title: ' ' }, { ...project, slug: '../admin' }, { ...project, category: {} }, { ...project, overview: {} }, { ...project, technologies: ['not the API format'] }]) {
    assert.throws(() => readPublicProject(value))
  }
  assert.equal(validProjectSlug('qa-project-2'), true)
  for (const slug of ['bad/slug', 'bad slug', 'javascript:alert(1)', '..', '', undefined]) assert.equal(validProjectSlug(slug), false)
})

test('optional metadata stays optional and project content is preserved as literal text', () => {
  const parsed = readPublicProject({ ...project, title: ' <script>alert(1)</script> ', overview: 'First line\nSecond line', content: '<img src=x onerror=alert(1)>', technologies: 'React, SQL', image_url: null })
  assert.equal(parsed.title, '<script>alert(1)</script>')
  assert.equal(parsed.overview, 'First line\nSecond line')
  assert.equal(parsed.content, '<img src=x onerror=alert(1)>')
  assert.equal(parsed.image_url, '')
  assert.equal(parsed.project_url, '')
})
