import { useEffect, useMemo, useState } from "react";
import { Button, DotLoading, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listLabOccupancy, listLabSpaces, type LabOccupancy, type LabSpace } from "../api/lab";
import { listMembers } from "../api/members";
import CloudLabScene3D from "../components/CloudLabScene3D";
import type { Member } from "../types/api";

const styles = `
  .cloud-lab-scene-page {
    min-height: 100vh;
    background: #F6F7F9;
    color: #1F2329;
    padding: 16px;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .cloud-lab-scene-shell {
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    gap: 14px;
  }
  .cloud-lab-scene-head,
  .cloud-lab-scene-panel {
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FFFFFF;
  }
  .cloud-lab-scene-head {
    padding: 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .cloud-lab-scene-title {
    font-size: 22px;
    line-height: 1.2;
    font-weight: 900;
  }
  .cloud-lab-scene-muted {
    margin-top: 6px;
    color: #8F959E;
    font-size: 12px;
  }
  .cloud-lab-scene-panel {
    overflow: hidden;
  }
  .cloud-lab-3d-canvas {
    width: 100%;
    height: 560px;
    min-height: 420px;
    display: block;
    outline: none;
    touch-action: none;
  }
  .cloud-lab-scene-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .cloud-lab-scene-btn {
    border: 1px solid #D9E2F2;
    border-radius: 999px;
    background: #FFFFFF;
    color: #4E5969;
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 800;
  }
  .cloud-lab-scene-btn[data-active="true"] {
    background: #E8F3FF;
    color: #1D4ED8;
    border-color: #93C5FD;
  }
`;

const CloudLabScenePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<LabSpace[]>([]);
  const [occupancy, setOccupancy] = useState<LabOccupancy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<"all" | number>("all");

  const occupiedBySpace = useMemo(() => {
    const map = new Map<number, number>();
    occupancy.forEach((item) => map.set(item.space_id, (map.get(item.space_id) || 0) + 1));
    return map;
  }, [occupancy]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      listLabSpaces(),
      listLabOccupancy(),
      listMembers({ page_size: 200 }),
    ])
      .then(([spacePage, occupancyPage, memberPage]) => {
        if (!alive) return;
        setSpaces(spacePage.items);
        setOccupancy(occupancyPage.items);
        setMembers(memberPage.items);
      })
      .catch(() => {
        if (alive) Toast.show({ icon: "fail", content: "3D 场景数据加载失败" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="cloud-lab-scene-page">
      <style>{styles}</style>
      <div className="cloud-lab-scene-shell">
        <div className="cloud-lab-scene-head">
          <div>
            <div className="cloud-lab-scene-title">云实验室 3D 场景</div>
            <div className="cloud-lab-scene-muted">独立实验视图，不改变现有 /cloud-lab 页面。</div>
          </div>
          <Button size="small" fill="outline" onClick={() => navigate("/cloud-lab")}>返回云实验室</Button>
        </div>

        <div className="cloud-lab-scene-bar">
          <button className="cloud-lab-scene-btn" type="button" data-active={activeSceneId === "all"} onClick={() => setActiveSceneId("all")}>
            全实验室 · {occupancy.length}
          </button>
          {spaces.map((space) => (
            <button
              key={space.space_id}
              className="cloud-lab-scene-btn"
              type="button"
              data-active={activeSceneId === space.space_id}
              onClick={() => setActiveSceneId(space.space_id)}
            >
              {space.name} · {occupiedBySpace.get(space.space_id) || 0}
            </button>
          ))}
        </div>

        <section className="cloud-lab-scene-panel">
          {loading ? (
            <div style={{ minHeight: 420, display: "grid", placeItems: "center" }}>
              <DotLoading />
            </div>
          ) : (
            <CloudLabScene3D
              spaces={spaces}
              occupancy={occupancy}
              members={members}
              activeSceneId={activeSceneId}
              onSelectSpace={setActiveSceneId}
            />
          )}
        </section>
      </div>
    </div>
  );
};

export default CloudLabScenePage;
