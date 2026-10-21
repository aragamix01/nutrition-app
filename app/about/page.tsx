import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <Link
        href="/profile"
        className="label"
        style={{ color: 'var(--basil)', textDecoration: 'none' }}
      >
        ‹ โปรไฟล์
      </Link>
      <h1 className="title" style={{ margin: 0 }}>
        เกี่ยวกับแอป
      </h1>
      <p style={{ margin: 0 }}>
        แอปส่วนตัวสำหรับบันทึกอาหารและคำนวณสารอาหาร ตัวเลขจาก AI เป็นค่าประมาณ แก้กรัมได้เสมอ
      </p>

      <section
        className="nu-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <h2 className="heading" style={{ margin: 0 }}>
          USDA FoodData Central
        </h2>
        <p className="caption nu-muted" style={{ margin: 0 }}>
          Source: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.{' '}
          <a href="https://fdc.nal.usda.gov" style={{ color: 'var(--basil)' }}>
            fdc.nal.usda.gov
          </a>
        </p>
      </section>

      <section
        className="nu-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <h2 className="heading" style={{ margin: 0 }}>
          Thai Food Composition Database
        </h2>
        <p className="caption nu-muted" style={{ margin: 0 }}>
          Kunchit Judprasong, Prapasri Puwastien, Nipa Rojroongwasinkul, Anadi Nitithamyong, Piyanut
          Sridonpai, Amnat Somjai. Institute of Nutrition, Mahidol University (2025). Thai Food
          Composition Database, Online version 3, August 2025, Thailand.{' '}
          <a href="https://inmu.mahidol.ac.th/thaifcd/home" style={{ color: 'var(--basil)' }}>
            inmu.mahidol.ac.th/thaifcd
          </a>
        </p>
      </section>
    </main>
  );
}
