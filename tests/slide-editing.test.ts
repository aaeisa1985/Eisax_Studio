import { describe, expect, it } from "vitest";
import { alignElements, distributeElements, elementFormat, snapPosition } from "@/lib/presentation/editing";
import { slideToCanvasElements } from "@/lib/presentation/elements";
import { resolveSlideTheme } from "@/lib/projects/themes";
import { slideItemSchema, type SlideElement } from "@/lib/validation/projects";
import { buildPptx } from "@/lib/export/pptx";
import JSZip from "jszip";

const box = (id: string, x: number, w = 10, locked = false): SlideElement => ({id,kind:"shape",x,y:10,w,h:10,zIndex:1,locked});

describe("slide arrangement", () => {
  it("aligns unequal widths and preserves locked anchors and unrelated elements", () => {
    const input = [box("a",10,10,true),box("b",40,20),box("c",80)];
    const result = alignElements(input,["a","b"],"right");
    expect(result[0]).toBe(input[0]);
    expect(result[1]?.x).toBe(40);
    expect(result[2]).toBe(input[2]);
    expect(alignElements(input,["a","b"],"left")[1]?.x).toBe(10);
  });
  it("distributes equal gaps rather than centers and preserves endpoints", () => {
    const input=[box("a",0,10),box("b",20,20),box("c",80,10)];
    const result=distributeElements(input,["a","b","c"],"x");
    expect(result.map(e=>e.x)).toEqual([0,35,80]);
    expect(distributeElements([box("a",0,10,true),...input.slice(1)],["a","b","c"],"x")[1]?.x).toBe(20);
  });
  it("snaps to nearby canvas and object guides with an explicit bypass", () => {
    const result=snapPosition({x:39.5,y:19.5,w:20,h:10},[box("a",20,20)]);
    expect(result.box.x).toBe(40);
    expect(result.guides.some(g=>g.axis==="x" && g.position===50)).toBe(true);
    expect(snapPosition({x:39.5,y:19.5,w:20,h:10},[],0).box.x).toBe(39.5);
  });
  it("copies formatting without geometry, content, group, or locking metadata", () => {
    const format=elementFormat({...box("source",30),text:"private text",bold:true,groupId:"g",locked:true,color:"AABBCC"});
    expect(format.bold).toBe(true);
    expect(format.color).toBe("AABBCC");
    expect(format).not.toHaveProperty("text");
    expect(format).not.toHaveProperty("x");
    expect(format).not.toHaveProperty("groupId");
    expect(format).not.toHaveProperty("locked");
  });
  it("gives legacy slide objects stable IDs and preserves intentionally empty slides", () => {
    const slide=slideItemSchema.parse({id:"legacy",title:"Title",subtitle:"Subtitle"});
    const theme=resolveSlideTheme("default");
    expect(slideToCanvasElements(slide,theme).map(e=>e.id)).toEqual(slideToCanvasElements(slide,theme).map(e=>e.id));
    expect(slideToCanvasElements({...slide,elements:[]},theme)).toEqual([]);
  });
  it("exports intentionally empty slides without resurrecting legacy titles", async () => {
    const result = await buildPptx("Empty", {slides:[{id:"empty",title:"Removed title",elements:[]}]});
    if ("error" in result) throw new Error(result.error);
    const zip=await JSZip.loadAsync(result.data);
    expect(await zip.file("ppt/slides/slide1.xml")!.async("string")).not.toContain("Removed title");
  });
  it("retains grouped objects as separate editable PPTX shapes", async () => {
    const result = await buildPptx("Objects", {slides:[{id:"s",elements:[{...box("a",10),groupId:"g"},{...box("b",30),groupId:"g",locked:true}]}]});
    if ("error" in result) throw new Error(result.error);
    const zip=await JSZip.loadAsync(result.data);
    const xml=await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml.match(/<p:sp>/g)).toHaveLength(2);
  });
});
