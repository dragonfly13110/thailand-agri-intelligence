'use client';

import React, { useMemo, useState } from 'react';
import type {
  CommodityTradeProfile,
  CommodityYearData,
  TradeDashboardPayload,
} from '@/lib/hub/trade-data';
import { Icon } from './icon';
import styles from './trade-dashboard.module.css';

interface TradeDashboardProps {
  payload?: TradeDashboardPayload;
  initialPayload?: TradeDashboardPayload;
}

export function TradeDashboard({ payload, initialPayload }: TradeDashboardProps) {
  const activePayload = payload || initialPayload;
  if (!activePayload) {
    return <div>ไม่พบข้อมูล</div>;
  }
  const [selectedYear, setSelectedYear] = useState<number>(activePayload.selectedYear || 2024);
  const [selectedCommodityId, setSelectedCommodityId] = useState<string>('rice');
  const [historyPeriod, setHistoryPeriod] = useState<'annual' | 'quarterly'>('annual');

  const { kpi, allCommodities, meta } = activePayload;

  // Selected commodity profile
  const currentCommodity: CommodityTradeProfile = useMemo(() => {
    return allCommodities.find((c) => c.id === selectedCommodityId) || allCommodities[0];
  }, [allCommodities, selectedCommodityId]);

  // Selected year data for current commodity
  const currentYearData: CommodityYearData = useMemo(() => {
    return (
      currentCommodity.years[selectedYear] ||
      currentCommodity.years[2024] ||
      Object.values(currentCommodity.years)[0]
    );
  }, [currentCommodity, selectedYear]);

  // Calculations for Farm-gate vs FOB Spread
  // Note: 1 USD ~ 35.8 THB (reference exchange rate), 1 Ton = 1000 Kg
  // FOB price in THB/kg = (fobAvgPriceUsdPerTon * 35.8) / 1000
  const fobThbPerKg = useMemo(() => {
    const usdPerTon = currentYearData.fobAvgPriceUsdPerTon;
    return Number(((usdPerTon * 35.8) / 1000).toFixed(2));
  }, [currentYearData]);

  const farmgateThbPerKg = currentYearData.farmgateAvgPriceThbPerKg;
  const priceSpreadThbPerKg = useMemo(() => {
    return Number((fobThbPerKg - farmgateThbPerKg).toFixed(2));
  }, [fobThbPerKg, farmgateThbPerKg]);

  const spreadMarginPct = useMemo(() => {
    if (farmgateThbPerKg <= 0) return 0;
    return Number(((priceSpreadThbPerKg / farmgateThbPerKg) * 100).toFixed(1));
  }, [priceSpreadThbPerKg, farmgateThbPerKg]);

  return (
    <div className={styles.container}>
      {/* 1. Data Governance Banner */}
      <section className={styles.sampleBanner} role="region" aria-label="ประกาศ Data Governance">
        <div className={styles.sampleBannerIcon}>
          <Icon name="info" size={20} />
        </div>
        <div className={styles.sampleBannerBody}>
          <div className={styles.bannerTitleRow}>
            <h3 className={styles.bannerTitle}>
              ข้อมูลตัวอย่างสถิติการส่งออก-นำเข้าเพื่อการสาธิตระบบ (Sample Data based on Customs & MoC Schema)
            </h3>
            <span className={styles.bannerBadge}>SAMPLE: TRUE</span>
            <span className={styles.bannerBadge}>ACCESS: METADATA_ONLY</span>
          </div>
          <p>
            สถิติตัวเลขในแดชบอร์ดนี้เป็นข้อมูลตัวอย่างเชิงสถิติ (Deterministic Sample Data)
            เพื่อใช้สาธิตระบบและการประมวลผลห่วงโซ่มูลค่าการค้าตามพิกัดศุลกากร (HS Code 4-6 หลัก)
            ตัวเลขจริงในระดับธุรกรรมทางการยังอยู่ระหว่างกระบวนการขอสิทธิ์เผยแพร่ตามกรอบ Data Governance ของ Hub
          </p>
          <ul className={styles.warningList}>
            {meta.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 2. Macro KPI Summary Cards */}
      <section className={styles.macroSection}>
        <div className={styles.macroSectionHeader}>
          <h2>ภาพรวมการค้าสินค้าเกษตรระหว่างประเทศของไทย</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={styles.asOfPill}>
              ปี {selectedYear + 543} ({selectedYear})
            </span>
            <div className={styles.periodToggle}>
              {activePayload.availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`${styles.periodButton} ${selectedYear === yr ? styles.periodButtonActive : ''}`}
                  onClick={() => setSelectedYear(yr)}
                >
                  พ.ศ. {yr + 543}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.metricsGrid}>
          {/* Card 1: Total Agri Export */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>มูลค่าส่งออกสินค้าเกษตรรวม</span>
              <div className={styles.metricIconWrap}>
                <Icon name="chart" size={18} />
              </div>
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                {(kpi.totalExportValueMillionBaht / 1000).toLocaleString('th-TH', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span className={styles.metricUnit}>พันล้านบาท</span>
            </div>
            <div className={styles.metricFooter}>
              <span
                className={`${styles.trendPill} ${kpi.yoyExportGrowthPct >= 0 ? styles.trendUp : styles.trendDown}`}
              >
                {kpi.yoyExportGrowthPct >= 0 ? '▲' : '▼'} {Math.abs(kpi.yoyExportGrowthPct)}% YoY
              </span>
              <span>
                (
                {(kpi.totalExportValueMillionBaht).toLocaleString('th-TH')}{' '}
                ล้านบาท)
              </span>
            </div>
          </div>

          {/* Card 2: Trade Balance */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>ดุลการค้าสินค้าเกษตร (สุทธิ)</span>
              <div className={styles.metricIconWrap}>
                <Icon name="leaf" size={18} />
              </div>
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue} style={{ color: '#1a7a3b' }}>
                +
                {(kpi.tradeBalanceMillionBaht / 1000).toLocaleString('th-TH', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span className={styles.metricUnit}>พันล้านบาท</span>
            </div>
            <div className={styles.metricFooter}>
              <span className={`${styles.trendPill} ${styles.trendUp}`}>
                ได้ดุลการค้า
              </span>
              <span>
                นำเข้า{' '}
                {(kpi.totalImportValueMillionBaht / 1000).toLocaleString('th-TH', {
                  minimumFractionDigits: 1,
                })}{' '}
                พันล้านบาท
              </span>
            </div>
          </div>

          {/* Card 3: Total Volume */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>ปริมาณส่งออกรวม 5 สินค้าหลัก</span>
              <div className={styles.metricIconWrap}>
                <Icon name="download" size={18} />
              </div>
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                {kpi.totalExportVolumeMillionTons.toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                })}
              </span>
              <span className={styles.metricUnit}>ล้านตัน</span>
            </div>
            <div className={styles.metricFooter}>
              <span className={`${styles.trendPill} ${styles.trendNeutral}`}>
                ครอบคลุม 5 หมวด
              </span>
              <span>ข้าว, ยาง, มัน, ปาล์ม, ทุเรียน</span>
            </div>
          </div>

          {/* Card 4: Top Partner & Rising Star */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>ตลาดคู่ค้าอันดับ 1 / ดาวเด่น</span>
              <div className={styles.metricIconWrap}>
                <Icon name="pin" size={18} />
              </div>
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                {kpi.topPartner.flag} {kpi.topPartner.country}
              </span>
              <span className={styles.metricUnit}>
                {kpi.topPartner.sharePct}% ของยอดรวม
              </span>
            </div>
            <div className={styles.metricFooter}>
              <span className={`${styles.trendPill} ${styles.trendUp}`}>
                ⭐ {kpi.risingStar.name}
              </span>
              <span>+{kpi.risingStar.yoyGrowthPct}% YoY</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Commodity Selection Tabs */}
      <section className={styles.commodityTabsSection}>
        <div className={styles.tabsContainer} role="tablist" aria-label="เลือกหมวดสินค้าเกษตร">
          {allCommodities.map((item) => {
            const isActive = item.id === selectedCommodityId;
            const yearVal = item.years[selectedYear] || item.years[2024];
            const valBn = ((yearVal?.exportValueMillionBaht || 0) / 1000).toFixed(1);

            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                className={`${styles.commodityTab} ${isActive ? styles.tabActive : ''}`}
                onClick={() => setSelectedCommodityId(item.id)}
              >
                <span>{item.name}</span>
                <span className={styles.tabPill}>{valBn} พันล้าน</span>
              </button>
            );
          })}
        </div>

        {/* Commodity Detail Card */}
        <div className={styles.commodityHero}>
          <div className={styles.commodityHeader}>
            <div className={styles.commodityTitleArea}>
              <div className={styles.titleWithBadge}>
                <h2>{currentCommodity.name}</h2>
                <span className={styles.hsCodeBadge}>HS Code: {currentCommodity.hsCode}</span>
                <span className={styles.rankBadge}>พ.ศ. {selectedYear + 543}</span>
              </div>
              <p className={styles.commodityDesc}>
                <strong>{currentCommodity.nameEn}:</strong> {currentCommodity.description}
              </p>
            </div>
          </div>

          <div className={styles.highlightsBox}>
            <strong>พิกัดศุลกากรย่อย (HS Subheadings):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
              {currentCommodity.hsSubheadings.map((sh, idx) => (
                <li key={idx}>{sh}</li>
              ))}
            </ul>
          </div>

          {/* Commodity KPI Stat Bar */}
          <div className={styles.commodityStatBar}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>มูลค่าส่งออกปี {selectedYear + 543}</span>
              <span className={styles.statValue}>
                {(currentYearData.exportValueMillionBaht / 1000).toFixed(1)} พันล้านบาท
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>ปริมาณส่งออก</span>
              <span className={styles.statValue}>
                {currentYearData.exportVolumeMillionTons.toFixed(2)} ล้านตัน
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>ดุลการค้าสินค้าหมวดนี้</span>
              <span className={styles.statValue} style={{ color: '#1a7a3b' }}>
                +{(currentYearData.tradeBalanceMillionBaht / 1000).toFixed(1)} พันล้านบาท
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>อัตราเติบโตส่งออก YoY</span>
              <span
                className={styles.statValue}
                style={{
                  color: currentYearData.yoyExportValueGrowthPct >= 0 ? '#1b7a3e' : '#c52727',
                }}
              >
                {currentYearData.yoyExportValueGrowthPct >= 0 ? '+' : ''}
                {currentYearData.yoyExportValueGrowthPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Key Export Gateways */}
          <div>
            <h4 style={{ fontSize: '13.5px', color: 'var(--forest)', margin: '4px 0 8px' }}>
              ด่านศุลกากรและท่าเรือหลักที่ใช้ส่งออก (Key Export Gateways):
            </h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {currentYearData.keyGateways.map((gw, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    background: '#eef4eb',
                    borderRadius: '6px',
                    color: '#284d35',
                    border: '1px solid #dce8d6',
                  }}
                >
                  {gw.type === 'sea' ? '🚢' : gw.type === 'land' ? '🚛' : '✈️'} {gw.name} ({gw.sharePct}%)
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4 & 5. Two-column Grid: Top Markets & Price Spread */}
      <div className={styles.twoColGrid}>
        {/* Destination Markets Breakdown */}
        <section className={styles.marketsCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3>ตลาดคู่ค้าสำคัญ (Top Destination Markets)</h3>
              <span className={styles.cardSub}>
                สัดส่วนมูลค่าการส่งออก {currentCommodity.name} ปี {selectedYear + 543}
              </span>
            </div>
            <span className={styles.asOfPill}>
              {currentYearData.topDestinations.length} ตลาดหลัก
            </span>
          </div>

          <div className={styles.marketList}>
            {currentYearData.topDestinations.map((market) => (
              <div key={market.rank} className={styles.marketRow}>
                <div className={styles.marketRowTop}>
                  <div className={styles.marketNameWrap}>
                    <span style={{ fontSize: '16px' }}>{market.flag}</span>
                    <span className={styles.marketCodeBadge}>{market.countryCode}</span>
                    <span className={styles.marketName}>{market.country}</span>
                  </div>
                  <div className={styles.marketValues}>
                    <span className={styles.marketValText}>
                      {(market.valueMillionBaht / 1000).toFixed(1)} พันล้านบาท
                    </span>
                    <span className={styles.marketShareText}>{market.sharePct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className={styles.progressBarContainer}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${Math.min(100, market.sharePct * 2)}%` }}
                  />
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>อันดับ {market.rank}</span>
                  <span>ปริมาณ {market.volumeMillionTons.toFixed(2)} ล้านตัน</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Farm-gate vs FOB Export Price Spread */}
        <section className={styles.spreadCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3>ดัชนีราคาส่งออก FOB เทียบราคาหน้าฟาร์ม</h3>
              <span className={styles.cardSub}>
                Farm-gate vs FOB Price Spread & Value Chain Analysis
              </span>
            </div>
          </div>

          <div className={styles.spreadKpiGrid}>
            <div className={styles.spreadKpiBox}>
              <span className={styles.spreadBoxLabel}>ราคาเฉลี่ยหน้าฟาร์ม (Farm-gate)</span>
              <span className={styles.spreadBoxVal}>
                {farmgateThbPerKg.toFixed(2)}{' '}
                <small style={{ fontSize: '13px', fontWeight: 500 }}>บาท/กก.</small>
              </span>
            </div>

            <div className={styles.spreadKpiBox}>
              <span className={styles.spreadBoxLabel}>
                ราคาเฉลี่ยส่งออก (FOB Export)
              </span>
              <span className={styles.spreadBoxVal}>
                {fobThbPerKg.toFixed(2)}{' '}
                <small style={{ fontSize: '13px', fontWeight: 500 }}>
                  บาท/กก. (FOB ${currentYearData.fobAvgPriceUsdPerTon}/ตัน)
                </small>
              </span>
            </div>

            <div className={styles.spreadHighlightBox}>
              <span className={styles.spreadBoxLabel}>ส่วนต่างราคา (Price Spread)</span>
              <span className={styles.spreadHighlightVal}>
                +{priceSpreadThbPerKg.toFixed(2)} บาท/กก.
              </span>
            </div>

            <div className={styles.spreadHighlightBox}>
              <span className={styles.spreadBoxLabel}>Spread Ratio</span>
              <span className={styles.spreadHighlightVal}>
                +{spreadMarginPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className={styles.spreadNote}>
            <strong>โครงสร้างต้นทุนและห่วงโซ่มูลค่า (Cost Structure Breakdown):</strong>
            <p style={{ margin: '4px 0 8px', fontSize: '12px' }}>
              ส่วนต่างระหว่างราคาหน้าฟาร์มและราคา FOB สะท้อนต้นทุนการแปรรูป คัดเกรด บรรจุภัณฑ์
              การขนส่ง และพิธีการส่งออกของไทย
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {currentYearData.costStructure.map((c, idx) => (
                <div key={idx} style={{ fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>
                      {c.component} ({c.sharePct}%)
                    </span>
                    <strong>
                      {c.unitAmount.toFixed(2)} {c.unit}
                    </strong>
                  </div>
                  <div
                    style={{
                      height: '5px',
                      background: '#e0ebd8',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${c.sharePct}%`,
                        background: '#356345',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 6. Historical Quarterly / Annual Comparison Table */}
      <section className={styles.historySection}>
        <div className={styles.historyControls}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--forest)' }}>
              สถิติการส่งออก-นำเข้าย้อนหลัง ({currentCommodity.name})
            </h3>
            <span className={styles.cardSub}>
              เปรียบเทียบมูลค่า ปริมาณ ดุลการค้า และอัตราการเติบโต YoY
            </span>
          </div>

          <div className={styles.periodToggle} role="group" aria-label="สลับช่วงเวลาการแสดงผล">
            <button
              type="button"
              className={`${styles.periodButton} ${historyPeriod === 'annual' ? styles.periodButtonActive : ''}`}
              onClick={() => setHistoryPeriod('annual')}
            >
              รายปี (Annual 2565 - 2567)
            </button>
            <button
              type="button"
              className={`${styles.periodButton} ${historyPeriod === 'quarterly' ? styles.periodButtonActive : ''}`}
              onClick={() => setHistoryPeriod('quarterly')}
            >
              รายไตรมาส (Quarterly Q1 - Q4 ปี {selectedYear + 543})
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {historyPeriod === 'annual' ? (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>ปี พ.ศ. (ค.ศ.)</th>
                  <th>ปริมาณส่งออก (ล้านตัน)</th>
                  <th>มูลค่าส่งออก (ล้านบาท)</th>
                  <th>มูลค่านำเข้า (ล้านบาท)</th>
                  <th>ดุลการค้า (ล้านบาท)</th>
                  <th>อัตราเติบโต YoY</th>
                  <th>ราคา FOB เฉลี่ย</th>
                </tr>
              </thead>
              <tbody>
                {activePayload.availableYears.map((yr) => {
                  const d = currentCommodity.years[yr];
                  if (!d) return null;
                  return (
                    <tr key={yr}>
                      <td>
                        <strong>
                          พ.ศ. {d.yearBe} ({d.year})
                        </strong>
                      </td>
                      <td>{d.exportVolumeMillionTons.toFixed(2)}</td>
                      <td>{d.exportValueMillionBaht.toLocaleString('th-TH')}</td>
                      <td>{d.importValueMillionBaht.toLocaleString('th-TH')}</td>
                      <td className={styles.surplusText}>
                        +{d.tradeBalanceMillionBaht.toLocaleString('th-TH')}
                      </td>
                      <td>
                        <span
                          className={`${styles.trendPill} ${d.yoyExportValueGrowthPct >= 0 ? styles.trendUp : styles.trendDown}`}
                        >
                          {d.yoyExportValueGrowthPct >= 0 ? '+' : ''}
                          {d.yoyExportValueGrowthPct.toFixed(1)}%
                        </span>
                      </td>
                      <td>${d.fobAvgPriceUsdPerTon} / ตัน</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>ไตรมาส</th>
                  <th>ช่วงเดือน</th>
                  <th>ปริมาณส่งออก (ล้านตัน)</th>
                  <th>มูลค่าส่งออก (ล้านบาท)</th>
                  <th>อัตราเติบโต YoY</th>
                  <th>ปัจจัยฤดูกาล / ความเคลื่อนไหว</th>
                </tr>
              </thead>
              <tbody>
                {currentYearData.quarterlyTrends.map((q) => (
                  <tr key={q.quarter}>
                    <td>
                      <strong>{q.label}</strong>
                    </td>
                    <td>{q.months}</td>
                    <td>{q.volumeMillionTons.toFixed(2)}</td>
                    <td>{q.valueMillionBaht.toLocaleString('th-TH')}</td>
                    <td>
                      <span
                        className={`${styles.trendPill} ${q.yoyGrowthPct >= 0 ? styles.trendUp : styles.trendDown}`}
                      >
                        {q.yoyGrowthPct >= 0 ? '+' : ''}
                        {q.yoyGrowthPct.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {q.seasonalFactor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 7. Data Sources & Governance Section */}
      <section className={styles.sourcesSection}>
        <div className={styles.sourcesHeader}>
          <h3>แหล่งข้อมูลอ้างอิงและสิทธิ์การเผยแพร่ (Data Governance & Provenance)</h3>
          <span className={styles.asOfPill}>3 หน่วยงานภาครัฐ</span>
        </div>

        <div className={styles.sourcesGrid}>
          {meta.sources.map((src, idx) => (
            <div key={idx} className={styles.sourceCard}>
              <span className={styles.sourceCardTitle}>{src.name}</span>
              <span className={styles.sourceDept}>{src.org}</span>
              <div style={{ marginTop: '4px' }}>
                <div>
                  <strong>สถานะสิทธิ์:</strong>{' '}
                  <span className={styles.bannerBadge}>{meta.access}</span>
                </div>
                <div>
                  <strong>ข้อมูล ณ วันที่:</strong> {meta.dataAsOf}
                </div>
              </div>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourceLink}
              >
                <span>เว็บไซต์หน่วยงาน</span>
                <Icon name="external" size={13} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
