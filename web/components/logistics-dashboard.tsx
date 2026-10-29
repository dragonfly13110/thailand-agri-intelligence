'use client';

import React, { useMemo, useState } from 'react';
import type {
  Facility,
  FacilityType,
  FacilityStatus,
  LogisticsDashboardPayload,
  ProvinceConnectivity,
} from '@/lib/hub/logistics-data';
import { Icon } from './icon';
import styles from './logistics-dashboard.module.css';

const numberFormatter = new Intl.NumberFormat('th-TH');
const percentFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

const CARD_PAGE_SIZE = 12;
const TABLE_PAGE_SIZE = 20;

export interface LogisticsDashboardProps {
  initialPayload?: LogisticsDashboardPayload;
  payload?: LogisticsDashboardPayload;
}

export function LogisticsDashboard({ initialPayload, payload }: LogisticsDashboardProps) {
  const activePayload = (initialPayload || payload)!;
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<FacilityType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<FacilityStatus | 'all'>('all');
  const [selectedCapacityTier, setSelectedCapacityTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);

  // กรองรายการสิ่งอำนวยความสะดวกตามเงื่อนไขของผู้ใช้
  const filteredFacilities = useMemo(() => {
    return activePayload.facilities.filter((fac) => {
      if (selectedProvince !== 'all' && fac.provinceCode !== selectedProvince) {
        return false;
      }
      if (selectedType !== 'all' && fac.type !== selectedType) {
        return false;
      }
      if (selectedStatus !== 'all' && fac.status !== selectedStatus) {
        return false;
      }
      if (selectedCapacityTier !== 'all') {
        if (selectedCapacityTier === 'small' && fac.capacityTons >= 20000) return false;
        if (selectedCapacityTier === 'medium' && (fac.capacityTons < 20000 || fac.capacityTons > 40000)) return false;
        if (selectedCapacityTier === 'large' && (fac.capacityTons <= 40000 || fac.capacityTons > 60000)) return false;
        if (selectedCapacityTier === 'mega' && fac.capacityTons <= 60000) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = fac.name.toLowerCase().includes(q);
        const matchDistrict = fac.district.toLowerCase().includes(q);
        const matchProvince = fac.provinceName.toLowerCase().includes(q);
        const matchOperator = fac.operator.toLowerCase().includes(q);
        const matchCrop = fac.supportedCommodities.some((c) => c.toLowerCase().includes(q));
        if (!matchName && !matchDistrict && !matchProvince && !matchOperator && !matchCrop) {
          return false;
        }
      }
      return true;
    });
  }, [activePayload.facilities, selectedProvince, selectedType, selectedStatus, selectedCapacityTier, searchQuery]);

  // คำนวณค่าสถิติจากรายการที่ถูกกรอง
  const filteredMetrics = useMemo(() => {
    let capacity = 0;
    let utilized = 0;
    let connectivityTotal = 0;
    let distanceTotal = 0;

    for (const f of filteredFacilities) {
      capacity += f.capacityTons;
      utilized += f.utilizedTons;
      connectivityTotal += f.farmConnectivityScore;
      distanceTotal += f.avgFarmDistanceKm;
    }

    const count = filteredFacilities.length;
    const avgUtil = capacity > 0 ? (utilized / capacity) * 100 : 0;
    const avgScore = count > 0 ? connectivityTotal / count : 0;
    const avgDist = count > 0 ? distanceTotal / count : 0;

    return {
      count,
      totalCapacity: capacity,
      totalUtilized: utilized,
      avgUtilization: avgUtil,
      avgConnectivityScore: avgScore,
      avgFarmDistance: avgDist,
    };
  }, [filteredFacilities]);

  // กรองตารางดัชนีคะแนนรายจังหวัดตามภูมิภาค
  const filteredProvinceScores = useMemo(() => {
    if (regionFilter === 'all') return activePayload.provinceScores;
    return activePayload.provinceScores.filter((p) => p.region === regionFilter);
  }, [activePayload.provinceScores, regionFilter]);

  // แบ่งหน้ารายการคลังสินค้า (การ์ด 12 รายการ / ตาราง 20 แถว)
  const pageSize = viewMode === 'card' ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredFacilities.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedFacilities = filteredFacilities.slice(pageStart, pageStart + pageSize);
  const rangeFrom = filteredFacilities.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + pageSize, filteredFacilities.length);

  // ทุกครั้งที่ตัวกรองเปลี่ยน ให้กลับไปหน้าแรก
  const handleProvinceChange = (value: string) => {
    setSelectedProvince(value);
    setPage(1);
  };
  const handleTypeChange = (value: FacilityType | 'all') => {
    setSelectedType(value);
    setPage(1);
  };
  const handleStatusChange = (value: FacilityStatus | 'all') => {
    setSelectedStatus(value);
    setPage(1);
  };
  const handleCapacityTierChange = (value: string) => {
    setSelectedCapacityTier(value);
    setPage(1);
  };
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  // ฟังก์ชันรีเซ็ตฟิลเตอร์
  const handleResetFilters = () => {
    setSelectedProvince('all');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedCapacityTier('all');
    setSearchQuery('');
    setPage(1);
  };

  const goToPrevPage = () => setPage(Math.max(1, currentPage - 1));
  const goToNextPage = () => setPage(Math.min(totalPages, currentPage + 1));

  const hasActiveFilters =
    selectedProvince !== 'all' ||
    selectedType !== 'all' ||
    selectedStatus !== 'all' ||
    selectedCapacityTier !== 'all' ||
    searchQuery.trim().length > 0;

  const renderProgressClass = (utilPercent: number) => {
    if (utilPercent >= 90) return styles.progressCritical;
    if (utilPercent >= 75) return styles.progressWarning;
    return styles.progressNormal;
  };

  return (
    <div className={styles.container}>
      {/* แบนเนอร์ข้อมูลจำลอง / ตรวจสิทธิ์ */}
      <section className={styles.sampleBanner} aria-label="ข้อความแจ้งเตือนข้อมูลตัวอย่าง">
        <div className={styles.sampleBannerIcon} aria-hidden="true">
          <Icon name="info" size={20} />
        </div>
        <div className={styles.sampleBannerBody}>
          <strong>ระบบแสดงผลข้อมูลตัวอย่าง (Simulation &amp; Demo Mode)</strong>
          <p className={styles.sampleBannerLead}>
            ข้อมูลจำลองเพื่อวางแผนระบบขนส่งเกษตรและประเมินดัชนี Farm-to-Storage Connectivity — ยังไม่ใช่สถิติทางการ
          </p>
          <details className={styles.details}>
            <summary className={styles.detailsSummary}>อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล</summary>
            <div className={styles.detailsBody}>
              <p>
                ข้อมูลตำแหน่งคลังสินค้า ไซโล และห้องเย็น รวมถึงระดับสต็อกความจุในหน้านี้เป็นข้อมูลจำลองเพื่อการวางแผนระบบขนส่งเกษตร
                และประเมินดัชนี <em>Farm-to-Storage Connectivity Score</em> ข้อมูลพิกัดกายภาพจริงอยู่ระหว่างการตรวจสอบสิทธิ์ความมั่นคงทางอาหาร
              </p>
              <ul className={styles.warningList}>
                {activePayload.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </section>

      {/* KPI Overview Cards */}
      <section className={styles.kpiSection} aria-labelledby="logistics-kpi-heading">
        <h2 id="logistics-kpi-heading" className={styles.sectionHeading}>
          สรุปภาพรวมคลังสินค้าและห่วงโซ่ความเย็น
        </h2>
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span>ความจุคลังทั้งหมดที่คัดกรอง</span>
              <span className={styles.kpiIcon}>
                <Icon name="catalog" size={16} />
              </span>
            </div>
            <div className={styles.kpiValue}>
              {numberFormatter.format(filteredMetrics.totalCapacity)} <span style={{ fontSize: 16 }}>ตัน</span>
            </div>
            <div className={styles.kpiSub}>
              <span>จากทั้งหมด {filteredMetrics.count} แห่ง</span>
              <span>(จัดเก็บแล้ว {numberFormatter.format(filteredMetrics.totalUtilized)} ตัน)</span>
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span>อัตราการใช้พื้นที่คลัง (Utilization)</span>
              <span className={styles.kpiIcon}>
                <Icon name="chart" size={16} />
              </span>
            </div>
            <div className={styles.kpiValue}>{percentFormatter.format(filteredMetrics.avgUtilization)}%</div>
            <div className={styles.kpiSub}>
              <span className={styles.kpiHighlight}>
                {filteredMetrics.avgUtilization > 85 ? 'ค่อนข้างหนาแน่น' : 'ระดับปกติ'}
              </span>
              <span>· รองรับสินค้าเกษตรฤดูกาลถัดไปได้</span>
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span>ดัชนี Farm-to-Storage เฉลี่ย</span>
              <span className={styles.kpiIcon}>
                <Icon name="pin" size={16} />
              </span>
            </div>
            <div className={styles.kpiValue}>
              {percentFormatter.format(filteredMetrics.avgConnectivityScore)} <span style={{ fontSize: 16 }}>/ 100</span>
            </div>
            <div className={styles.kpiSub}>
              <span>
                ระยะห่างเฉลี่ยจากแปลงปลูก: <strong>{percentFormatter.format(filteredMetrics.avgFarmDistance)} กม.</strong>
              </span>
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span>ความจุห้องเย็นควบคุมอุณหภูมิ</span>
              <span className={styles.kpiIcon}>
                <Icon name="water" size={16} />
              </span>
            </div>
            <div className={styles.kpiValue}>
              {numberFormatter.format(activePayload.summary.coldStorageCapacityTons)} <span style={{ fontSize: 16 }}>ตัน</span>
            </div>
            <div className={styles.kpiSub}>
              <span>ห่วงโซ่ความเย็น (Cold Chain) ผลไม้ สัตว์น้ำ และเนื้อสัตว์</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Search Controls */}
      <section className={styles.filterCard} aria-labelledby="logistics-filter-heading">
        <h2 id="logistics-filter-heading" className={styles.sectionHeading}>
          ค้นหาและคัดกรองรายการคลังสินค้า
        </h2>

        {/* Search input */}
        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="ค้นหาชื่อคลัง, อำเภอ, จังหวัด, ผู้ดูแล (อคส./สหกรณ์), ชนิดพืช (ข้าว, ทุเรียน, ยางพารา, สัตว์น้ำ)..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="ค้นหาคลังสินค้า"
            />
          </div>
        </div>

        {/* Filter controls row */}
        <div className={styles.filterControlsRow}>
          {/* Province dropdown */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="province-select">
              จังหวัด (77 จังหวัด)
            </label>
            <select
              id="province-select"
              className={styles.selectInput}
              value={selectedProvince}
              onChange={(e) => handleProvinceChange(e.target.value)}
            >
              <option value="all">ทุกจังหวัด (77 จังหวัด)</option>
              {activePayload.allProvinces.map((prov) => (
                <option key={prov.code} value={prov.code}>
                  {prov.code} - {prov.name} ({prov.region})
                </option>
              ))}
            </select>
          </div>

          {/* Facility Type dropdown */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="type-select">
              ชนิดคลังสินค้า
            </label>
            <select
              id="type-select"
              className={styles.selectInput}
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value as FacilityType | 'all')}
            >
              <option value="all">ทุกชนิดคลังสินค้า</option>
              <option value="silo">ไซโลอบแห้ง (Grain Silo)</option>
              <option value="cold_storage">ห้องเย็นผลไม้/เนื้อสัตว์ (Cold Chain)</option>
              <option value="general_warehouse">โกดังสินค้าเกษตรทั่วไป (General Warehouse)</option>
            </select>
          </div>

          {/* Capacity Tier dropdown */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="capacity-select">
              ขนาดความจุ (ตัน)
            </label>
            <select
              id="capacity-select"
              className={styles.selectInput}
              value={selectedCapacityTier}
              onChange={(e) => handleCapacityTierChange(e.target.value)}
            >
              <option value="all">ทุกขนาดความจุ</option>
              <option value="small">ขนาดเล็ก (&lt; 20,000 ตัน)</option>
              <option value="medium">ขนาดกลาง (20,000 - 40,000 ตัน)</option>
              <option value="large">ขนาดใหญ่ (40,000 - 60,000 ตัน)</option>
              <option value="mega">ขนาดใหญ่พิเศษ (&gt; 60,000 ตัน)</option>
            </select>
          </div>

          {/* Status dropdown */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="status-select">
              สถานะคลัง
            </label>
            <select
              id="status-select"
              className={styles.selectInput}
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value as FacilityStatus | 'all')}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="operational">เปิดบริการ</option>
              <option value="maintenance">ซ่อมบำรุง</option>
              <option value="full">ความจุเต็ม</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.resetButton}
              onClick={handleResetFilters}
              aria-label="ล้างการคัดกรองทั้งหมด"
            >
              <Icon name="close" size={14} /> ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Quick Filter Pills for Facility Type */}
        <div className={styles.typePills} role="group" aria-label="กรองประเภทคลังด่วน">
          <button
            type="button"
            className={`${styles.typePill} ${selectedType === 'all' ? styles.typePillActive : ''}`}
            onClick={() => handleTypeChange('all')}
          >
            <span>ทั้งหมด</span>
            <span className={styles.typePillCount}>{activePayload.facilities.length}</span>
          </button>
          {activePayload.facilityTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.typePill} ${selectedType === t.id ? styles.typePillActive : ''}`}
              onClick={() => handleTypeChange(t.id)}
            >
              <span>{t.label}</span>
              <span className={styles.typePillCount}>{t.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Facilities Results Header & View Toggle */}
      <section className={styles.resultsSection} aria-labelledby="logistics-results-heading">
        <div className={styles.sectionBar}>
          <div className={styles.sectionTitle}>
            <h2 id="logistics-results-heading" className={styles.sectionHeadingInline}>
              รายการโครงสร้างพื้นฐานจัดเก็บสินค้าเกษตร
            </h2>
            <span className={styles.resultCount}>
              (พบ {numberFormatter.format(filteredFacilities.length)} แห่ง จากทั้งหมด{' '}
              {numberFormatter.format(activePayload.facilities.length)} แห่ง)
            </span>
          </div>

          <div className={styles.viewToggleGroup} role="group" aria-label="เปลี่ยนรูปแบบการแสดงผล">
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'card' ? styles.viewToggleButtonActive : ''}`}
              onClick={() => setViewMode('card')}
              aria-pressed={viewMode === 'card'}
              aria-label="แสดงผลแบบการ์ด"
            >
              <Icon name="layers" size={15} /> มุมมองการ์ด
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'table' ? styles.viewToggleButtonActive : ''}`}
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              aria-label="แสดงผลแบบตาราง"
            >
              <Icon name="catalog" size={15} /> มุมมองตาราง
            </button>
          </div>
        </div>

        {filteredFacilities.length === 0 && (
          <div className={styles.emptyState}>
            <p>ไม่พบคลังสินค้าที่ตรงกับเงื่อนไขที่เลือก</p>
            <button type="button" className={styles.resetButton} onClick={handleResetFilters}>
              <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}

        {/* Facility Results: Card View */}
        {viewMode === 'card' && filteredFacilities.length > 0 && (
          <div className={styles.facilityGrid}>
            {pagedFacilities.map((fac) => {
              const progressClass = renderProgressClass(fac.utilizationRate);

              return (
                <article key={fac.id} className={styles.facilityCard}>
                  <div className={styles.cardTopRow}>
                    {/* Type Badge */}
                    <span
                      className={`${styles.typeBadge} ${
                        fac.type === 'silo'
                          ? styles.typeBadgeSilo
                          : fac.type === 'cold_storage'
                          ? styles.typeBadgeColdStorage
                          : styles.typeBadgeWarehouse
                      }`}
                    >
                      {fac.type === 'silo' && <Icon name="chart" size={13} />}
                      {fac.type === 'cold_storage' && <Icon name="water" size={13} />}
                      {fac.type === 'general_warehouse' && <Icon name="layers" size={13} />}
                      {fac.typeLabel}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`${styles.statusBadge} ${
                        fac.status === 'operational'
                          ? styles.statusOperational
                          : fac.status === 'maintenance'
                          ? styles.statusMaintenance
                          : styles.statusFull
                      }`}
                    >
                      ● {fac.statusLabel}
                    </span>
                  </div>

                  <div>
                    <h3 className={styles.facilityTitle}>{fac.name}</h3>
                    <div className={styles.facilityLocation}>
                      <Icon name="pin" size={13} />
                      <span>
                        อ.{fac.district} จ.{fac.provinceName} ({fac.region})
                      </span>
                    </div>
                  </div>

                  <div className={styles.operatorText}>
                    ผู้ดำเนินงาน: <strong>{fac.operator}</strong> ({fac.operatorTypeLabel})
                  </div>

                  {/* Capacity & Progress */}
                  <div className={styles.capacityBox}>
                    <div className={styles.capacityLabels}>
                      <span className={styles.capacityTotal}>
                        ความจุ: {numberFormatter.format(fac.capacityTons)} ตัน
                      </span>
                      <span className={styles.capacityPercent}>
                        {percentFormatter.format(fac.utilizationRate)}% ใช้งานแล้ว
                      </span>
                    </div>
                    <div
                      className={styles.progressTrack}
                      title={`ใช้งานแล้ว ${fac.utilizedTons} จาก ${fac.capacityTons} ตัน`}
                    >
                      <div
                        className={`${styles.progressBar} ${progressClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, fac.utilizationRate))}%` }}
                      />
                    </div>
                    <div style={{ fontSize: 11.5, color: '#68756a', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span>สต็อกปัจจุบัน: {numberFormatter.format(fac.utilizedTons)} ตัน</span>
                      <span>ว่าง: {numberFormatter.format(fac.capacityTons - fac.utilizedTons)} ตัน</span>
                    </div>
                  </div>

                  {/* Farm-to-Storage Connectivity Score Box */}
                  <div className={styles.connectivityBox}>
                    <div>
                      <span style={{ fontSize: 11, color: '#53645a', display: 'block' }}>Farm-to-Storage Connectivity</span>
                      <div className={styles.connectivityScoreCol}>
                        <span className={styles.connectivityScoreNumber}>{fac.farmConnectivityScore}</span>
                        <span className={styles.connectivityScoreMax}>/100</span>
                        <span style={{ fontSize: 11.5, marginLeft: 4, fontWeight: 600, color: '#166534' }}>
                          ({fac.connectivityGradeLabel})
                        </span>
                      </div>
                    </div>
                    <div className={styles.distanceBadge}>
                      <Icon name="arrow" size={13} />
                      <span>~{fac.avgFarmDistanceKm} กม. จากแปลง</span>
                    </div>
                  </div>

                  {/* Commodities tags */}
                  <div className={styles.commodityRow}>
                    {fac.supportedCommodities.map((crop, cIdx) => (
                      <span key={cIdx} className={styles.commodityTag}>
                        {crop}
                      </span>
                    ))}
                  </div>

                  {/* Specific features / transport */}
                  <div className={styles.specsBox}>
                    {fac.temperatureControlled && fac.temperatureRange && (
                      <div>
                        ❄️ อุณหภูมิควบคุม: <strong>{fac.temperatureRange}</strong>
                      </div>
                    )}
                    {fac.dryingCapacityTonsPerDay && (
                      <div>
                        🔥 กำลังการอบแห้ง: <strong>{numberFormatter.format(fac.dryingCapacityTonsPerDay)} ตัน/วัน</strong>
                      </div>
                    )}
                    <div>🚛 เส้นทาง: {fac.transportAccess}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Facility Results: Table View */}
        {viewMode === 'table' && filteredFacilities.length > 0 && (
          <div
            className={`${styles.tableContainer} ${styles.scrollRegion}`}
            role="region"
            aria-label="ตารางรายการคลังสินค้า เลื่อนแนวนอนเพื่อดูคอลัมน์ทั้งหมด"
            tabIndex={0}
          >
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>ชื่อคลัง / รหัส</th>
                  <th>ชนิดคลัง</th>
                  <th>จังหวัด/อำเภอ</th>
                  <th>ความจุ (ตัน)</th>
                  <th>อัตราใช้งาน</th>
                  <th>ดัชนี Farm-to-Storage</th>
                  <th>สถานะ</th>
                  <th>ผู้ดูแล</th>
                </tr>
              </thead>
              <tbody>
                {pagedFacilities.map((fac) => (
                  <tr key={fac.id}>
                    <td>
                      <strong>{fac.name}</strong>
                      <div style={{ fontSize: 11.5, color: '#68756a' }}>{fac.id}</div>
                    </td>
                    <td>
                      <span
                        className={`${styles.typeBadge} ${
                          fac.type === 'silo'
                            ? styles.typeBadgeSilo
                            : fac.type === 'cold_storage'
                            ? styles.typeBadgeColdStorage
                            : styles.typeBadgeWarehouse
                        }`}
                      >
                        {fac.typeLabel}
                      </span>
                    </td>
                    <td>
                      {fac.provinceName} (อ.{fac.district})
                    </td>
                    <td>
                      <strong>{numberFormatter.format(fac.capacityTons)}</strong> ตัน
                    </td>
                    <td>
                      <strong>{percentFormatter.format(fac.utilizationRate)}%</strong>
                      <div style={{ fontSize: 11, color: '#68756a' }}>({numberFormatter.format(fac.utilizedTons)} ตัน)</div>
                    </td>
                    <td>
                      <div>
                        <strong>{fac.farmConnectivityScore}/100</strong>
                        <span style={{ fontSize: 12, color: '#53645a', marginLeft: 4 }}>({fac.avgFarmDistanceKm} กม.)</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          fac.status === 'operational'
                            ? styles.statusOperational
                            : fac.status === 'maintenance'
                            ? styles.statusMaintenance
                            : styles.statusFull
                        }`}
                      >
                        ● {fac.statusLabel}
                      </span>
                    </td>
                    <td>{fac.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <nav className={styles.pager} aria-label="การแบ่งหน้ารายการคลังสินค้า">
          <p className={styles.pagerInfo} aria-live="polite">
            แสดง {numberFormatter.format(rangeFrom)}-{numberFormatter.format(rangeTo)} จาก{' '}
            {numberFormatter.format(filteredFacilities.length)} แห่ง
            {totalPages > 1 ? ` · หน้า ${numberFormatter.format(currentPage)} จาก ${numberFormatter.format(totalPages)}` : ''}
          </p>
          {totalPages > 1 && (
            <div className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={goToPrevPage}
                disabled={currentPage <= 1}
                aria-label="หน้าก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>
              <span className={styles.pagerStatus}>
                หน้า {numberFormatter.format(currentPage)} จาก {numberFormatter.format(totalPages)}
              </span>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={goToNextPage}
                disabled={currentPage >= totalPages}
                aria-label="หน้าถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </nav>
      </section>

      {/* Farm-to-Storage Connectivity Score Deep-Dive Section */}
      <section className={styles.connectivityContainer} aria-labelledby="logistics-connectivity-heading">
        <div className={styles.connectivityHeader}>
          <h2 id="logistics-connectivity-heading" className={styles.sectionHeading}>
            การประเมินดัชนีระยะห่างจากแหล่งผลิตถึงจุดรวบรวม
          </h2>
          <details className={styles.details}>
            <summary className={styles.detailsSummary}>อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล</summary>
            <div className={styles.detailsBody}>
              <p>
                ดัชนีชี้วัดประสิทธิภาพโครงสร้างพื้นฐานหลังการเก็บเกี่ยว (Post-harvest Logistics)
                ประเมินจากระยะทางโครงข่ายถนนเฉลี่ยจากแปลงปลูกถึงไซโลหรือห้องเย็นที่ใกล้ที่สุด
                ความพอเพียงของกำลังการอบลดความชื้น และความเสี่ยงการเกิดคอขวดของผลผลิตเกษตรรายจังหวัด
              </p>
            </div>
          </details>
        </div>

        {/* Tier Classification Explanation Cards */}
        <div className={styles.tierGrid}>
          <div className={`${styles.tierCard} ${styles.tierCardHigh}`}>
            <h3 className={styles.tierTitle}>
              <span>ระดับดีเยี่ยม (Score 80-100)</span>
              <span>&lt; 20 กม.</span>
            </h3>
            <p className={styles.tierDesc}>
              เกษตรกรเข้าถึงคลังได้รวดเร็วภายใน 30-45 นาทีหลังเก็บเกี่ยว ลดความเสียหายจากความชื้นในข้าว
              และรักษาความสดของผลไม้/สัตว์น้ำได้สูงสุด มีโครงข่ายถนนเชื่อมโยงสมบูรณ์
            </p>
          </div>

          <div className={`${styles.tierCard} ${styles.tierCardModerate}`}>
            <h3 className={styles.tierTitle}>
              <span>ระดับปานกลาง (Score 65-79)</span>
              <span>20 - 35 กม.</span>
            </h3>
            <p className={styles.tierDesc}>
              เข้าถึงได้ในเกณฑ์มาตรฐาน มีคลังรองรับระดับอำเภอ แต่อาจเกิดคอขวดและรอคิวนานช่วงฤดูเก็บเกี่ยวสูงสุด (Peak Harvest Period)
              ควรเสริมไซโลชุมชนหรือลานตากเสริม
            </p>
          </div>

          <div className={`${styles.tierCard} ${styles.tierCardLow}`}>
            <h3 className={styles.tierTitle}>
              <span>พื้นที่ห่างไกล / เสี่ยงคอขวด (&lt; 65)</span>
              <span>&gt; 35 กม.</span>
            </h3>
            <p className={styles.tierDesc}>
              แปลงเกษตรอยู่ห่างไกลคลังหลักหรือเป็นพื้นที่ภูเขาสูง มีความเสี่ยงผลผลิตเน่าเสียสูง เกษตรกรต้องแบกรับต้นทุนค่าขนส่ง
              ควรได้รับการลงทุนสถานีรวบรวมและห้องเย็นเคลื่อนที่เร่งด่วน
            </p>
          </div>
        </div>
      </section>

      {/* Provincial Connectivity Scores Table */}
      <section className={styles.connectivityContainer} aria-labelledby="logistics-ranking-heading">
        <div className={styles.rankingHeader}>
          <h2 id="logistics-ranking-heading" className={styles.sectionHeading}>
            คะแนนความเชื่อมโยงและระยะห่างรายจังหวัด (77 จังหวัดทั่วประเทศ)
          </h2>
          <div className={styles.regionPills} role="group" aria-label="กรองตารางรายจังหวัดตามภูมิภาค">
            {['all', 'ภาคกลาง', 'ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคใต้', 'ภาคตะวันออก', 'ภาคตะวันตก'].map((reg) => (
              <button
                key={reg}
                type="button"
                className={`${styles.regionPill} ${regionFilter === reg ? styles.regionPillActive : ''}`}
                onClick={() => setRegionFilter(reg)}
                aria-pressed={regionFilter === reg}
              >
                {reg === 'all' ? 'ทุกภาค' : reg}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`${styles.tableContainer} ${styles.provinceTableWrap} ${styles.scrollRegion}`}
          role="region"
          aria-label="ตารางคะแนนความเชื่อมโยงรายจังหวัด เลื่อนดูได้ทั้งแนวนอนและแนวตั้ง"
          tabIndex={0}
        >
          <table className={styles.provinceRankTable}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>รหัส</th>
                <th>จังหวัด</th>
                <th>ภาค</th>
                <th>พืชเศรษฐกิจหลัก</th>
                <th>ระยะห่างเฉลี่ยจากแปลง</th>
                <th>ดัชนีคะแนน</th>
                <th>ระดับความพร้อม</th>
                <th>ข้อเสนอแนะเชิงนโยบาย</th>
              </tr>
            </thead>
            <tbody>
              {filteredProvinceScores.map((prov: ProvinceConnectivity) => (
                <tr key={prov.provinceCode}>
                  <td>
                    <strong>{prov.provinceCode}</strong>
                  </td>
                  <td>
                    <strong>{prov.provinceName}</strong>
                  </td>
                  <td>{prov.region}</td>
                  <td>{prov.dominantCommodity}</td>
                  <td>{prov.avgFarmDistanceKm} กม.</td>
                  <td>
                    <span
                      className={`${styles.scorePill} ${
                        prov.grade === 'high'
                          ? styles.scorePillHigh
                          : prov.grade === 'moderate'
                          ? styles.scorePillModerate
                          : styles.scorePillLow
                      }`}
                    >
                      {prov.connectivityScore} / 100
                    </span>
                  </td>
                  <td>{prov.gradeLabel}</td>
                  <td style={{ fontSize: 12, color: '#53645a' }}>{prov.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.rankingNote} aria-live="polite">
          แสดง {numberFormatter.format(filteredProvinceScores.length)} จังหวัด · 77 จังหวัดเป็นทะเบียนอ้างอิง ไม่ใช่ coverage
        </p>
      </section>

      {/* Sources & Transparency Section */}
      <section className={styles.sourcesCard} aria-labelledby="logistics-sources-heading">
        <h2 id="logistics-sources-heading" className={styles.sectionHeading}>
          แหล่งข้อมูล ข้อจำกัด และความโปร่งใส
        </h2>
        <div className={styles.sourcesGrid}>
          {activePayload.sources.map((src) => (
            <div key={src.id} className={styles.sourceItem}>
              <strong>{src.name}</strong>
              <span>{src.agencyLabel}</span>
              <span>{src.role}</span>
              <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer">
                เยี่ยมชมเว็บไซต์ต้นทาง →
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
