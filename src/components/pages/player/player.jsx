import React, { useState, useEffect, memo } from 'react';
import { Midi } from '@tonejs/midi';
import Mousetrap from 'mousetrap';

import Lyrics from './lyrics';
import audioPlayerHigh from './helper/audioPlayerHigh';
import audioPlayerLow from './helper/audioPlayerLow';
import isNextLyrics from './helper/isNextLyrics';
import './player.scss';

const lyricsSection = React.createRef();
const [NAV_HEIGHT, PADDING, TOP_HEIGHT, BUTTONS_HEIGHT] = [64, 16, 24 + 8, 128];

// 파트
let sopPlayer, altoPlayer, tenPlayer, bassPlayer;

const Player = (props) => {
  const { pathname: path } = props.location;
  const { chants, soundQuality } = props;
  const [wordIndex, setWordIndex] = useState(0);
  const [allNotes, setAllNotes] = useState([]);
  const [isLoad, setIsLoad] = useState(false);

  // 절
  const [currentLyricsNumber, setCurrentLyricsNumber] = useState(1);
  const [isPrelude, setIsPrelude] = useState(false);

  const audioPlayer = soundQuality === 'low' ? audioPlayerLow : audioPlayerHigh;

  // 단축키 설정
  Mousetrap.bind('space', () => {
    handlePlayButton();
  });
  Mousetrap.bind('backspace', () => {
    handleReleaseButton();
  });
  useEffect(() => {
    return () => {
      Mousetrap.unbind('space');
      Mousetrap.unbind('backspace');
    };
  }, []);

  const getDocumentHeight = () => {
    return document.documentElement.clientHeight;
  };

  const getLyricsSectionHeight = () => {
    const restHeight = NAV_HEIGHT + PADDING + TOP_HEIGHT + BUTTONS_HEIGHT;
    return getDocumentHeight() - restHeight + 'px';
  };

  useEffect(() => {
    lyricsSection.current.style.height = getLyricsSectionHeight();
    window.onresize = () => {
      lyricsSection.current.style.height = getLyricsSectionHeight();
    };
    return () => {
      window.onresize = null;
    };
  }, []);

  const id = Number(path.substring(8));

  const getIdForMidiFile = (id) => {
    id = id.toString();
    if (id.length === 1) return '000' + id;
    else if (id.length === 2) return '00' + id;
    else if (id.length === 3) return '0' + id;
  };

  let [chant] = chants.filter((chant) => {
    if (chant.id === id) return true;
    return false;
  });

  const convertWordIndex = (wordIndex, lyricsNumber) => {
    setWordIndex(wordIndex);
    setCurrentLyricsNumber(lyricsNumber);
  };

  useEffect(() => {
    (async function () {
      const midi = await Midi.fromUrl(`../midi/${getIdForMidiFile(id)}.mid`);
      console.log('midi : ', midi);
      const soprano = midi.tracks[0];
      const alto = midi.tracks[1];
      const tenor = midi.tracks[2];
      const bass = midi.tracks[3];
      const newNotes = [];
      let [sopIdx, altoIdx, tenIdx, bassIdx] = [0, 0, 0, 0];

      // 소프라노 배열이 끝날 때까지 soprano의 값을 순서대로 넣는다.
      while (soprano.notes[sopIdx]) {
        let obj = {};
        const { name, ticks, durationTicks } = soprano.notes[sopIdx];
        obj['soprano'] = { pitch: name, ticks, durationTicks };

        // alto가 soprano보다 클 때까지
        while (
          alto &&
          alto.notes[altoIdx] &&
          alto.notes[altoIdx].ticks <= ticks
        ) {
          // 그러다 ticks이 일치하는 게 있으면 넣는다.
          if (alto.notes[altoIdx].ticks === ticks) {
            const { name, durationTicks } = alto.notes[altoIdx];
            obj['alto'] = {
              pitch: name,
              ticks,
              durationTicks,
            };
          }
          altoIdx++;
        }

        // tenor가 soprano보다 클 때까지
        while (
          tenor &&
          tenor.notes[tenIdx] &&
          tenor.notes[tenIdx].ticks <= ticks
        ) {
          // 그러다 ticks이 일치하는 게 있으면 넣는다.
          if (tenor.notes[tenIdx].ticks === ticks) {
            const { name, durationTicks } = tenor.notes[tenIdx];
            obj['tenor'] = {
              pitch: name,
              ticks,
              durationTicks,
            };
          }
          tenIdx++;
        }

        // bass가 soprano보다 클 때까지
        while (
          bass &&
          bass.notes[bassIdx] &&
          bass.notes[bassIdx].ticks <= ticks
        ) {
          // 그러다 ticks이 일치하는 게 있으면 넣는다.
          if (bass.notes[bassIdx].ticks === ticks) {
            const { name, durationTicks } = bass.notes[bassIdx];
            obj['bass'] = {
              pitch: name,
              ticks,
              durationTicks,
            };
          }
          bassIdx++;
        }

        newNotes.push(obj);
        sopIdx++;
      }

      console.log('allNotes 설정 : ', newNotes);
      setAllNotes(newNotes);
    })();

    // componentWillUnmount
    return () => {
      audioPlayer.removeNote(sopPlayer, altoPlayer, tenPlayer, bassPlayer);
    };
  }, []);

  // 필요한 음원 불러오기
  useEffect(() => {
    (async function () {
      if (allNotes.length > 0) {
        const pitchs = {};
        allNotes.forEach((note) => {
          if (note.soprano) pitchs[note.soprano.pitch] = 1;
          if (note.alto) pitchs[note.alto.pitch] = 1;
          if (note.bass) pitchs[note.bass.pitch] = 1;
          if (note.tenor) pitchs[note.tenor.pitch] = 1;
        });

        const loadPitchs = [];
        for (let key in pitchs) {
          loadPitchs.push(key);
        }
        audioPlayer.loadNote.apply(null, loadPitchs);
        setIsLoad(true);
      }
    })();
  }, [allNotes]);

  const handleReleaseButton = () => {
    if (sopPlayer) {
      audioPlayer.fadeoutNote(sopPlayer);
      // setSopPlayer(undefined);
      sopPlayer = undefined;
    }
    if (altoPlayer) {
      audioPlayer.fadeoutNote(altoPlayer);
      // setAltoPlayer(undefined);
      altoPlayer = undefined;
    }
    if (tenPlayer) {
      audioPlayer.fadeoutNote(tenPlayer);
      // setTenPlayer(undefined);
      tenPlayer = undefined;
    }
    if (bassPlayer) {
      audioPlayer.fadeoutNote(bassPlayer);
      // setBassPlayer(undefined);
      bassPlayer = undefined;
    }
  };

  const handlePlayButton = async () => {
    let currentNotes = allNotes[wordIndex];
    console.log('currentNotes : ', currentNotes);

    // 각 파트를 소리 내기 전에 이전의 소리를 멈춤
    const { soprano, alto, tenor, bass } = currentNotes;
    if (soprano && sopPlayer) audioPlayer.fadeoutNote(sopPlayer);
    if (alto && altoPlayer) audioPlayer.fadeoutNote(altoPlayer);
    if (tenor && tenPlayer) audioPlayer.fadeoutNote(tenPlayer);
    if (bass && bassPlayer) audioPlayer.fadeoutNote(bassPlayer);

    // 연주
    if (soprano) sopPlayer = audioPlayer.playNote(soprano.pitch);
    if (alto) altoPlayer = audioPlayer.playNote(alto.pitch);
    if (tenor) tenPlayer = audioPlayer.playNote(tenor.pitch);
    if (bass) bassPlayer = audioPlayer.playNote(bass.pitch);

    // wordIndex가 끝에 이르렀을 경우
    if (allNotes.length - 1 === wordIndex) {
      if (isPrelude) {
        console.log('전주를 끝내고 처음 절로 돌아갑니다.');
        setCurrentLyricsNumber(1);
        closePreludeBox();
      } else if (isNextLyrics(currentLyricsNumber, chant.lyrics)) {
        console.log('다음 절로 갑니다.');
        setCurrentLyricsNumber(currentLyricsNumber + 1);
      } else {
        console.log('처음 절로 돌아갑니다.');
        setCurrentLyricsNumber(1);
      }
      setWordIndex(0);
    } else {
      setWordIndex(wordIndex + 1);
    }
  };

  const closePreludeBox = () => {
    lyricsSub.current.classList.remove('lyrics-sub-animation');
    setTimeout(() => {
      setIsPrelude(false);
    }, 400);
  };

  const openPreludeBox = () => {
    setTimeout(() => {
      lyricsSub.current.classList.add('lyrics-sub-animation');
    }, 0);
  };

  const handleCheckBox = () => {
    if (isPrelude) {
      closePreludeBox();
    } else {
      setIsPrelude(true);
    }
  };

  const lyricsSub = React.createRef();
  useEffect(() => {
    if (isPrelude === true) {
      openPreludeBox();
    }
  }, [isPrelude]);

  return (
    <main id="player">
      <section className="section-padding">
        <div id="top">
          <h3>
            {id}번 {chant.title}
          </h3>
          <div>
            <span>전주</span>
            <input
              type="checkbox"
              className="check-box"
              checked={isPrelude}
              onChange={handleCheckBox}
            />
          </div>
        </div>
        <div id="lyrics" ref={lyricsSection}>
          {isPrelude && (
            <div className="lyrics-sub" ref={lyricsSub}>
              전주로 시작할 가사를 클릭해주세요!
            </div>
          )}
          {chant.lyrics &&
            chant.lyrics.map((words, index) => (
              <Lyrics
                key={index}
                lyricsNumber={index + 1}
                currentLyricsNumber={currentLyricsNumber}
                lyrics={words}
                wordIndex={wordIndex}
                convertWordIndex={convertWordIndex}
              />
            ))}
        </div>
        <div id="buttons">
          <button
            disabled={!isLoad}
            onMouseDown={handleReleaseButton}
            className="normal-button"
            id="stop-button"
          >
            쉼표
          </button>
          <button
            disabled={!isLoad}
            onMouseDown={handlePlayButton}
            className="normal-button"
            id="play-button"
          >
            리듬 연주
          </button>
        </div>
      </section>
    </main>
  );
};

export default memo(Player);
