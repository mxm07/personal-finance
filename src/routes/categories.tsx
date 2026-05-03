import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { addCategory, addCategoryRule, getCategoriesData, removeCategoryRule } from '../server-functions'
import styles from './page.module.scss'

export const Route = createFileRoute('/categories')({
  loader: () => getCategoriesData(),
  component: CategoriesPage,
})

function CategoriesPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id ? String(data.categories[0].id) : '')
  const [matchText, setMatchText] = useState('')

  return (
    <section className={styles.page}>
      <header>
        <p className={styles.kicker}>Manual edits win</p>
        <h1 className={styles.heading}>Categories</h1>
      </header>

      <div className={styles.twoColumn}>
        <div className={styles.card}>
          <span className={styles.label}>Add category</span>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void addCategory({ data: { name } }).then(() => {
                setName('')
                router.invalidate()
              })
            }}
          >
            <input className={styles.field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" />
            <button className={styles.button} type="submit">Add category</button>
          </form>
        </div>

        <div className={styles.card}>
          <span className={styles.label}>Add rule</span>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void addCategoryRule({ data: { categoryId: Number(categoryId), matchText } }).then(() => {
                setMatchText('')
                router.invalidate()
              })
            }}
          >
            <select className={styles.field} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <input className={styles.field} value={matchText} onChange={(event) => setMatchText(event.target.value)} placeholder="Description contains..." />
            <button className={styles.button} type="submit">Add rule</button>
          </form>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rule text</th>
              <th>Category</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.matchText}</td>
                <td>{rule.categoryName}</td>
                <td>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => void removeCategoryRule({ data: { ruleId: rule.id } }).then(() => router.invalidate())}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!data.rules.length ? (
              <tr><td colSpan={3}>No rules yet. Rules apply during future syncs.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.card}>
        <span className={styles.label}>Current categories</span>
        <div className={styles.toolbar}>
          {data.categories.map((category) => (
            <span className={styles.pill} key={category.id}>{category.name}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
