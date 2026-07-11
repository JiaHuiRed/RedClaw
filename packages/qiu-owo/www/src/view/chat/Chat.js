
import ChatList from "./ChatList.js"
import InputBar from "./ChatInputBar.js"
import SessionList from "./ChatSessionList.js"
import data from "./chatData.js"
import comData from "../../comData/comData.js"
import ChatVideo from "./ChatVideo.js"
import Live2dChar from "./Live2dChar.js"
import settingData from "../setting/settingData.js"

export default () => {

  return {
    async oninit() {
      try {
        await comData.pullData()
      }
      catch (err) {
        throw err
      }
    },
    view() {
      const playFaces = comData.data.get()?.playFaces
      const playDoms = []

      return m("", {
        style: {
          width: "100%",
          height: "100%",
          padding: Mob ? "1rem 1rem 10rem 1rem" : "2rem 2rem 10rem 2rem",
          boxSizing: "border-box",
          display: "flex",
          position: "relative",
          //alignItems:"center",

        }
      }, [
        //bg

        m(ChatVideo),
        //left
        !window.Mob ? m("", {
          style: {
            flex: "0 0 25.5rem",
            //width:"20rem",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            borderRadius: "3rem",
            //border:"0.1rem solid #755d5c",
            marginRight: "2rem",
            //background:"#4a443f"
          }
        }, [
          settingData.options?.get("global_actorSwitch") !== 1 ? m("", {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: "50%",
              border: "0.1rem solid #755d5c",
              background: "#47464f",
              overflow: "hidden",
              height: "25rem",
              width: "25rem"
            }
          }, [
            m(Live2dChar),
          ]) : null,
          //m(SessionList)
        ]) : null,
        //right
        m("", {
          style: {
            flex: 5,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            position: "relative",
            height: "100%",
            width: "100%",
          }
        }, [
          (() => {
            const targetId = comData.data.get()?.targetChatListId || 0;
            const targetList = comData.data.get()?.chatLists?.find(l => l.id === targetId);
            const mainList = comData.data.get()?.chatLists?.find(l => l.id === 0);
            return m(ChatList, {
              chatList: targetList || mainList,
            })
          })(),
          m(InputBar),
          // 聊天背景（可通过设置自定义）
          (() => {
            const customBg = settingData.options?.get("chatBackground")
            if (!customBg) return null
            return m("", {
              style: {
                position: "absolute",
                width: "100%",
                height: "100%",
                opacity: "30%",
                backgroundImage: `url(${customBg})`,
                backgroundPosition: "right bottom",
                backgroundRepeat: "no-repeat",
                backgroundSize: "contain",
                pointerEvents: "none"
              }
            })
          })()
        ]),




      ])
    }
  }
}