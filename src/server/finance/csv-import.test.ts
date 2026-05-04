import { describe, expect, it } from 'vitest'
import { parseCapitalOneCsv, parseDiscoverCsv } from './csv-import'

describe('Capital One CSV import', () => {
  it('parses quoted descriptions and debit/credit columns from Capital One exports', () => {
    const rows = parseCapitalOneCsv([
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2025-05-02,2025-05-03,9463,"PITA BOWL, NEWARK",Dining,42.59,',
      '2025-04-30,2025-05-02,9463,AMAZON RETA* 9Z6GM6ZN3,Merchandise,,59.50',
    ].join('\n'))

    expect(rows).toEqual([
      {
        source: 'capital-one-csv',
        transactionDate: '2025-05-02',
        postedDate: '2025-05-03',
        accountKey: '9463',
        description: 'PITA BOWL, NEWARK',
        category: 'Dining',
        debit: '42.59',
        credit: '',
        amount: '',
        rowNumber: 2,
      },
      {
        source: 'capital-one-csv',
        transactionDate: '2025-04-30',
        postedDate: '2025-05-02',
        accountKey: '9463',
        description: 'AMAZON RETA* 9Z6GM6ZN3',
        category: 'Merchandise',
        debit: '',
        credit: '59.50',
        amount: '',
        rowNumber: 3,
      },
    ])
  })

  it('parses Discover signed-amount exports into the selected account', () => {
    const rows = parseDiscoverCsv([
      'Trans. Date,Post Date,Description,Amount,Category',
      '01/02/2026,01/03/2026,NETFLIX.COM,-26.65,Services',
    ].join('\n'), 'discover-account')

    expect(rows).toEqual([
      {
        source: 'discover-card-csv',
        transactionDate: '01/02/2026',
        postedDate: '01/03/2026',
        accountKey: 'discover-account',
        description: 'NETFLIX.COM',
        category: 'Services',
        debit: '',
        credit: '',
        amount: '-26.65',
        rowNumber: 2,
      },
    ])
  })

  it('parses Discover bank debit/credit exports into the selected account', () => {
    const rows = parseDiscoverCsv([
      'Transaction Date,Transaction Description,Transaction Type,Debit,Credit,Balance',
      '05/01/2026,Zelle Payment To MARTIN PEZO UBV1EX1ID,Debit,$450.00,0,$8211.65',
      '04/28/2026,Early Pay PAYROLL ACH from MONGODB INC,Credit,0,$2845.86,$8737.65',
    ].join('\n'), 'discover-bank-account')

    expect(rows).toEqual([
      {
        source: 'discover-bank-csv',
        transactionDate: '05/01/2026',
        postedDate: '05/01/2026',
        accountKey: 'discover-bank-account',
        description: 'Zelle Payment To MARTIN PEZO UBV1EX1ID',
        category: 'Debit',
        debit: '$450.00',
        credit: '0',
        amount: '',
        rowNumber: 2,
      },
      {
        source: 'discover-bank-csv',
        transactionDate: '04/28/2026',
        postedDate: '04/28/2026',
        accountKey: 'discover-bank-account',
        description: 'Early Pay PAYROLL ACH from MONGODB INC',
        category: 'Credit',
        debit: '0',
        credit: '$2845.86',
        amount: '',
        rowNumber: 3,
      },
    ])
  })
})
