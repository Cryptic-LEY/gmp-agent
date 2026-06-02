import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDifficultiesByType,
  buildPracticeQuestionUrl,
  getVisibleDifficulties,
  selectQuestionType,
} from './practice-filters'

test('groups only available difficulties by question type', () => {
  assert.deepEqual(
    buildDifficultiesByType([
      { questionType: '单选题', difficulty: '易' },
      { questionType: '单选题', difficulty: '难' },
      { questionType: '案例分析题', difficulty: '难' },
      { questionType: '单选题', difficulty: '易' },
    ]),
    {
      单选题: ['易', '难'],
      案例分析题: ['难'],
    },
  )
})

test('shows only difficulties available for the selected type', () => {
  assert.deepEqual(
    getVisibleDifficulties(
      ['易', '中', '难'],
      { 单选题: ['易', '中'], 案例分析题: ['难'] },
      'filters',
      '案例分析题',
    ),
    ['难'],
  )
})

test('clears a difficulty that does not exist for a new question type', () => {
  assert.deepEqual(
    selectQuestionType('案例分析题', '易', { 案例分析题: ['中', '难'] }),
    { questionType: '案例分析题', difficulty: '' },
  )
})

test('includes both question type and difficulty in filter-mode URLs', () => {
  assert.equal(
    buildPracticeQuestionUrl({
      mode: 'filters',
      questionType: '单选题',
      difficulty: '难',
      project: '',
      kpId: '',
    }),
    '/api/practice/question?type=%E5%8D%95%E9%80%89%E9%A2%98&difficulty=%E9%9A%BE',
  )
})
