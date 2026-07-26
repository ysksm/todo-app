import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest の globals を有効にしていないので、後片付けは自分で登録する。
afterEach(cleanup)

// jsdom には実装が無いが、マインドマップのフォーカス追従で呼び出す。
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
}

if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}
