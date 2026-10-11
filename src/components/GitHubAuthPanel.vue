<script setup lang="ts">
/* global URLSearchParams, window */
import { onMounted, onUnmounted, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabaseClient } from '../services/supabaseClient'

const user = ref<User | null>(null)
const sessionReady = ref(!supabaseClient)
const busy = ref(false)
const message = ref('')
let unsubscribe: (() => void) | undefined

onMounted(() => {
  if (!supabaseClient) return

  if (new URLSearchParams(window.location.search).has('error')
    || new URLSearchParams(window.location.hash.slice(1)).has('error')) {
    message.value = 'GitHub 登入未完成，請重試。'
  }

  const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
    sessionReady.value = true
  })
  unsubscribe = () => data.subscription.unsubscribe()
})

onUnmounted(() => unsubscribe?.())

async function signIn() {
  if (!supabaseClient || busy.value) return

  busy.value = true
  message.value = ''
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  } catch {
    message.value = '無法開始 GitHub 登入，請確認 Supabase 的 GitHub Provider 已設定。'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  if (!supabaseClient || busy.value) return

  busy.value = true
  message.value = ''
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' })
    if (error) {
      message.value = user.value
        ? '登出失敗，仍維持登入狀態。'
        : '已從此瀏覽器登出，但遠端工作階段撤銷失敗。'
    }
  } catch {
    message.value = user.value
      ? '登出失敗，仍維持登入狀態。'
      : '已從此瀏覽器登出，但遠端工作階段撤銷失敗。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section
    class="github-auth forge-panel"
    aria-labelledby="github-auth-title"
  >
    <div class="github-auth__copy">
      <h2 id="github-auth-title">
        Supabase 帳號
      </h2>
      <p
        v-if="!supabaseClient"
        role="status"
      >
        GitHub 登入未設定或設定無效；目前仍可使用本機記牌。
      </p>
      <template v-else>
        <p
          v-if="!sessionReady"
          role="status"
        >
          正在確認登入狀態…
        </p>
        <template v-else>
          <p
            v-if="user"
            role="status"
          >
            已使用 GitHub 登入。
          </p>
          <p v-else>
            登入只會驗證帳號；記牌資料仍保存在此瀏覽器。
          </p>
          <button
            type="button"
            :disabled="busy"
            @click="user ? signOut() : signIn()"
          >
            {{ busy ? '處理中…' : user ? '登出 GitHub' : '使用 GitHub 登入' }}
          </button>
        </template>
        <p
          v-if="message"
          class="github-auth__message"
          role="alert"
        >
          {{ message }}
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.github-auth {
  padding: 16px;
}

.github-auth__copy { display: grid; gap: 8px; }
.github-auth h2 { margin: 0; color: var(--ash); font-size: 16px; }
.github-auth p { margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.5; }
.github-auth button { width: fit-content; min-height: 44px; padding: 10px 14px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.github-auth button:hover:not(:disabled) { background: var(--seam); }
.github-auth button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.github-auth button:disabled { cursor: wait; opacity: .7; }
.github-auth .github-auth__message { color: var(--heat-burst); }
</style>
