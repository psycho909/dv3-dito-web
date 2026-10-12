import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { INITIAL_DECK, RANKS, type Deck } from '../../src/domain'
import type { RoundRecord } from '../../src/domain/gameReducer'
import { getNewDeckForecast, recommendWithinRound } from '../../src/domain/recommendation'
import PlayHistoryReference from '../../src/components/PlayHistoryReference.vue'

function finishedRound(index: number, draws: RoundRecord['draws'] = ['A', '10']): RoundRecord {
  return {
    id: `round-${index}`,
    cycleId: `cycle-${index}`,
    status: 'FINISHED',
    draws,
    startedAt: `2026-10-12T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
    finishedAt: `2026-10-12T00:01:${String(index % 60).padStart(2, '0')}.000Z`,
  }
}

function mountReference(rounds: readonly RoundRecord[] = [], currentDeck: Deck = INITIAL_DECK) {
  return mount(PlayHistoryReference, {
    props: {
      rounds,
      roundForecast: recommendWithinRound([], currentDeck),
      newDeckForecast: getNewDeckForecast(),
    },
  })
}

describe('PlayHistoryReference', () => {
  it('shows three comparable per-token bars, the cached new-deck baseline, and seven multiplier chips', () => {
    const wrapper = mountReference()

    expect(wrapper.findAll('[data-score-comparison]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="new-deck-baseline"]').text()).toContain('3.42 分')
    expect(wrapper.get('[data-score-comparison="actual"]').text()).toContain('完成第一局後顯示')
    expect(wrapper.findAll('[data-multiplier]')).toHaveLength(7)
    expect(wrapper.get('[data-multiplier="10"]').text()).toContain('100 遊玩代幣')
    expect(wrapper.get('[data-multiplier="30"]').text()).toContain('1,027 分')
    wrapper.unmount()
  })

  it('uses the fixed 6000-token amount, reports 600 x1 rounds and compares both estimates', async () => {
    const wrapper = mountReference(Array.from({ length: 40 }, (_, index) => finishedRound(index)))
    await wrapper.get('button[aria-label="填入 6,000 遊玩代幣"]').trigger('click')

    expect((wrapper.get('[data-testid="play-token-count"]').element as HTMLInputElement).value).toBe('6000')
    expect(wrapper.get('[data-testid="my-token-total"]').text()).toBe('約 60,000 分')
    expect(wrapper.get('[data-testid="baseline-token-total"]').text()).toBe('約 20,531 分')
    expect(wrapper.findAll('.play-history__games').map((element) => element.text())).toEqual([
      '600 場（x1 計）', '600 場（x1 計）',
    ])
    expect(wrapper.get('[data-testid="my-token-total"]').text()).toContain('60,000')
    expect(wrapper.get('.play-history__estimate-primary').text()).toContain('95% 參考區間：多數情況 60,000～60,000 分')
    expect(wrapper.get('.play-history__estimate-baseline').text()).toContain('95% 參考區間：')
    wrapper.unmount()
  })

  it('reports leftover tokens and rejects negative, decimal, nonnumeric, and unsafe values accessibly', async () => {
    const wrapper = mountReference()
    const input = wrapper.get('[data-testid="play-token-count"]')
    await input.setValue('6005')
    expect(wrapper.get('[data-testid="token-remainder"]').text()).toBe('剩 5 遊玩代幣不足一場。')
    expect(wrapper.get('.play-history__estimate-primary .play-history__games').text()).toBe('600 場（x1 計）')

    for (const value of ['-1', '4.5', 'abc', '9007199254740992']) {
      await input.setValue(value)
      expect(input.attributes('aria-invalid')).toBe('true')
      const error = wrapper.get('#play-token-count-error')
      expect(error.attributes('role')).toBe('alert')
      expect(input.attributes('aria-describedby')).toContain('play-token-count-error')
      expect(wrapper.find('[data-testid="play-token-estimates"]').exists()).toBe(false)
    }
    wrapper.unmount()
  })

  it('hides 95 percent intervals below 30 completed rounds', async () => {
    const wrapper = mountReference(Array.from({ length: 29 }, (_, index) => finishedRound(index)))
    await wrapper.get('[data-testid="play-token-count"]').setValue('6000')

    expect(wrapper.get('[data-testid="play-history-sample-note"]').text()).toContain('樣本少，僅供參考')
    expect(wrapper.text()).not.toContain('95% 參考區間')
    wrapper.unmount()
  })

  it('calculates the reference multipliers from the theoretical score and fills actual tier bars', () => {
    const customDeck = Object.fromEntries(RANKS.map((rank) => [rank, 3])) as Deck
    const wrapper = mountReference([
      finishedRound(1, ['10', '9']),
      finishedRound(2, ['10', '6']),
      finishedRound(3, ['10', '10', '2']),
    ], customDeck)

    expect(wrapper.get('[data-multiplier="10"]').text()).toContain('366 分')
    expect(wrapper.get('[data-history-tier="GREAT"] .play-history__tier-actual').attributes('style')).toContain('33.33333333333333%')
    expect(wrapper.get('[data-history-tier="GREAT"] .play-history__tier-theory').attributes('style')).toContain('left:')
    expect(wrapper.get('[data-history-tier="GOOD"] .play-history__tier-values').text()).toContain('實際 33.3%')
    wrapper.unmount()
  })
})
