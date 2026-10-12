import json
OUT="/tmp/claude-0/-home-claude/f1441400-c4e5-549d-8fa7-d8fbe0577479/scratchpad/seed/"
B="Bases du scoutisme.pdf"; F="fiches-BP.pdf"; Q="Quiz-BP.pdf"; H="Historique Scoutisme Senegal.pdf"; R="Connaissance du mvt rallye dak23.pdf"
D="la devise, l'esprit et les éléments fondamentaux du scoutismes.docx"; L="LE SCOUTISME.docx"
cards=[]
def c(q,a,src,note=None):
    d={"id":"t1-%02d"%(len(cards)+1),"q":q,"a":a,"src":src}
    if note: d["note"]=note
    cards.append(d)
# --- B-P
c("Quand et où est né Baden-Powell ?","Le **22 février 1857**, à Londres.",F+", "+Q)
c("Quel est le nom complet de B-P, et quel titre reçoit-il en 1929 ?","Robert Stephenson Smyth Baden-Powell. En 1929, le roi George V le fait **Lord Baden-Powell of Gilwell**.",F+", "+Q)
c("Quelles étaient les professions du père et de la mère de B-P ?","Père : pasteur protestant et professeur de géométrie à Oxford. Mère : naturaliste (Henrietta Grace Smyth).",F+", "+Q)
c("Qui était le parrain de B-P ?","Robert Stephenson, fils de l'inventeur de la locomotive.",F)
c("Quelle carrière B-P a-t-il eue avant le scoutisme, et quand l'a-t-il quittée ?","Militaire de **1876 à 1910**. Il démissionne en 1910 pour se consacrer entièrement au mouvement.",F+", "+B)
c("Quel épisode a rendu B-P célèbre, et pourquoi compte-t-il pour le scoutisme ?","Le **siège de Mafeking** (guerre des Boers, 1899-1900). C'est là que B-P découvre l'enthousiasme et l'utilité des jeunes (les « cadets de Mafeking »).",B)
c("Donne les trois surnoms africains de B-P et leur sens.","**M'hala Panzi** (Natal) : l'homme qui se couche pour tuer. **Kantakye** (Ashantis) : l'homme au grand chapeau. **Impeesa** (Matabélés) : le loup qui ne dort jamais.",F+", "+Q)
c("Quels instruments jouait B-P, et quelle fut sa première collection ?","Piano et violon. Sa première collection : un dessin fait à 3 ans (il adorait dessiner).",F+", "+Q)
c("Quand B-P épouse-t-il Olave Soames, et où se sont-ils rencontrés ?","Le **30 octobre 1912**. Ils se sont rencontrés lors d'une croisière (aux Antilles).",F+", "+Q)
c("Combien d'enfants ont eu Olave et B-P ?","Trois : **Peter** (1913, prénom d'après Peter Pan), **Heather** (1915) et **Betty** (1917).",F+", "+Q)
c("Pourquoi B-P a-t-il arrêté de fumer en entrant dans l'armée ?","Trois raisons : l'économie, le goût (il fumait par habitude) et l'odorat, un sens précieux dans l'art du « scouting » que le tabac altère.",F+", "+Q)
c("Combien de livres B-P a-t-il écrits ?","**32** au cours de sa vie.",F+", "+Q)
c("Que signifie le signe « fin de piste » sur la tombe de B-P, et où est-il enterré ?","Il signifie « retourné à la maison ». B-P est mort le **8 janvier 1941** à **Nyeri (Kenya)**, à 83 ans.",F+", "+B)
c("Que se passe-t-il pour B-P en 1939 ?","Il est mis en nomination pour le **prix Nobel de la paix**. Le prix n'est pas remis, la Seconde Guerre mondiale débutant cette année-là.",F+", "+Q)
c("Que devient Olave en 1916 puis en 1930 ?","1916 : elle remplace Agnès, sœur de B-P, chez les guides. 1930 : elle est choisie **Chef guide mondiale**.",F+", "+Q)
c("Quels cadeaux les scouts du monde ont-ils offerts à B-P et Olave en 1913 et en 1929 ?","1913 : une « Standard Landaulette ». 1929, au 3e Jamboree mondial : une Rolls-Royce baptisée **« Jam Roll »** (100 000 scouts ont donné un penny chacun).",F+", "+Q)
# --- Brownsea et début
c("Quelles sont les dates exactes du premier camp scout, et où a-t-il eu lieu ?","Du **29 juillet au 9 août 1907**, sur l'île de **Brownsea** (Angleterre).",F+", "+Q)
c("Combien de jeunes à Brownsea, et que faisaient-ils ?","Une vingtaine de jeunes. Jeux d'observation, de traque et de poursuite ; secourisme, nœuds, brêlages, camping, cuisine au feu de camp.",F,"Âge des jeunes : 9 à 17 ans selon fiches-BP, 12 à 17 ans selon Quiz-BP.")
c("Quels noms ont reçu les premières patrouilles de l'histoire ?","Les **loups, les taureaux, les courlis et les corbeaux**.",F+", "+Q)
c("Qui utilisait l'île de Brownsea avant B-P ?","Les pirates et les contrebandiers.",F+", "+Q)
c("Quel livre de B-P est publié en 1908, et sous quelle forme ?","**Scouting for Boys** (Éclaireurs), en six livraisons bimensuelles puis réunies en volume (éditeur Pearson).",B+", "+F)
c("Que se passe-t-il à Crystal Palace en 1909 ?","Le premier rallye : B-P invite les éclaireurs à se rassembler, **10 000** viennent.",B+", "+R)
c("Que rappellent 1914 et 1916 dans l'histoire du mouvement ?","**1914** : création du louvetisme. **1916** : publication du Livre du louveteau.",R)
c("La Route : quelle date de création, et quel livre B-P écrit-il pour les routiers ?","Création en **1918** (annale Rallye) ou **1919** (Bases du scoutisme). Livre : *La route du succès*, publié en **1922** selon l'annale Rallye.",R+", "+B,"Les sources ne s'accordent pas : à retenir avec la date de chaque source.")
c("Qu'est-ce que Gilwell, et qui a donné le parc au scoutisme ?","Le camp de formation des chefs lancé en **1919**. Le parc a été donné au scoutisme par **M. MacLaren**.",B)
c("Où et quand a eu lieu le premier Jamboree mondial, et que se passe-t-il pour B-P ?","À **Londres en 1920** (8 000 scouts de 34 pays). B-P est proclamé **Chef scout du monde**.",Q+", "+B+", "+F)
c("D'où vient le mot « jamboree », et à quel rythme ont lieu ces rassemblements ?","D'un mot zoulou qui veut dire « ralliement ». Rassemblements internationaux tous les **4 ans**.",B)
c("Que sait-on du Jamboree de 1929 ?","Il a eu lieu à **Birkenhead** (près de Liverpool), pour le 20e anniversaire, avec **50 000** scouts.",B)
c("Quelle est la date du premier Jamboree sur les ondes ?","**1958**.",Q)
c("Quels sont les trois degrés historiques du mouvement et leurs âges ?","**Louveteaux** (8-11 ans), **éclaireurs** (12-17 ans), **routiers** (17 ans et plus).",B,"Repères historiques du texte. Les âges peuvent différer dans les textes nationaux actuels.")
# --- Fondamentaux
c("Les 15 éléments fondamentaux : quels sont les trois groupes de cinq ?","Les **5 buts**, les **5 dimensions** et les **5 moteurs**.",B)
c("Cite les 5 buts du scoutisme (acronyme SSSDF).","**S**anté, **S**ervice du prochain, **S**ens de Dieu, **D**ébrouillardise (sens du concret), **F**ormation du caractère.",B)
c("Cite les 5 dimensions du scoutisme.","La nature et le camp, la patrouille, la règle du jeu (la loi scoute), le civisme (la B.A.), l'engagement (la promesse).",B)
c("Cite les 5 moteurs du scoutisme.","L'intérêt, l'action, les responsabilités, le système des patrouilles, la CDH et le CDC.",B)
c("Que dit le texte sur le « sens de Dieu » comme but ?","Il n'est pas en soi un but défini par B-P. Le but du scoutisme n'est pas de former de futurs prêtres, mais de bons citoyens.",B)
c("La promesse scoute est un triple engagement. Lequel ?","**Être loyal, aider autrui, observer la loi scoute.** Engagement volontaire, pris sur l'honneur devant ses frères.",B)
c("Pourquoi la loi scoute n'est-elle pas un règlement avec sanctions ?","C'est une série de « conseils de vie » proposés au jeune, qui choisit de faire de son mieux. Pas de sanction : une discussion pour l'aider à progresser.",B)
c("Combien d'articles compte la loi de B-P, et quel est le 11e ?","**10 articles** écrits. Le 11e, non écrit : « **Le scout n'est pas un sot.** »",B)
c("D'où vient la devise « Sois prêt » ?","Des initiales de B-P : **Be Prepared**.",D)
c("Quelles qualités la devise exige-t-elle de l'éclaireur ?","Le **sens des autres**, la **compétence**, l'**observation suivie du réflexe**.",D)
c("Que signifie être prêt d'esprit et prêt de corps selon B-P ?","**D'esprit** : s'être donné la discipline d'obéir et avoir pensé d'avance aux situations possibles. **De corps** : s'être rendu fort, actif, capable de faire au bon moment l'action qu'il faut.",D)
c("La bonne action (B.A.) : quelle règle sur la récompense, et que faire si on l'oublie ?","On n'accepte **jamais de récompense** (de l'argent, ce serait du travail payé). Si on l'oublie, on fait **deux bonnes actions le lendemain**.",B)
c("Que devient la B.A. à la meute, à la troupe et au clan ?","Meute : un plaisir fait chaque jour. Troupe : un réflexe d'aider, service spontané. Clan : un service permanent dans la communauté.",B)
c("Décris le salut scout et ce que signifient ses éléments.","Main droite, **trois doigts du milieu levés** (triple promesse ; franchise, dévouement, pureté), **pouce sur l'auriculaire** (le fort protège le faible).",B)
c("Pourquoi les scouts se serrent-ils la main gauche ?","Elle est du côté du cœur, et un chef ashanti l'a tendue à B-P : les plus braves serrent la main gauche, en abandonnant leur bouclier.",B+", "+F)
c("Que signifie la fleur de lys, et que veut dire le trèfle ?","La fleur de lys indique le **nord** sur les cartes : le scout sait toujours retrouver son chemin. Le **trèfle** est le symbole des guides.",F+", "+B)
c("Quel est l'appel scout, et quand le lance-t-on ?","« Sont-ils là les éclaireurs, sont-ils là ? » Réponse : « Ils sont là les éclaireurs, ils sont là. » On le lance avant d'entrer dans un coin de patrouille ou au Kraal.",B)
c("Quelle est la taille d'une patrouille ?","Historiquement **huit** (début du mouvement, Bases du scoutisme). Aujourd'hui **cinq à sept** (LE SCOUTISME).",B+", "+L,"Contradiction entre sources : à confirmer avec le Manuel du CP en décembre.")
c("Qu'est-ce que « l'esprit scout » ?","L'attitude qu'on doit avoir, balisée par la loi scoute : vivre scoutement partout et faire passer le bonheur des autres au moins autant que le sien.",D)
# --- Sénégal
c("Qui a eu l'idée de créer les scouts au Sénégal, et en quelle année ?","Le R.P. **Lecocq**, curé de Dakar (Sacré-Cœur), en **1931**. Naissance officieuse en décembre 1931.",H)
c("Quel jour et où les quatre premiers scouts du Sénégal ont-ils fait leur promesse ?","Le **8 mai 1932**, dans la cour de l'**école Saint Michel** à Dakar (fête de Sainte Jeanne d'Arc).",H)
c("Qui sont les quatre premiers scouts du Sénégal ?","Gabriel Sagna, Emmanuel Nunez, Georges Monteiro et Paul de Souza.",H)
c("Quelles sont les deux premières patrouilles du Sénégal et leurs chefs ?","**Rats palmistes** (CP Gabriel Sagna, SP Paul de Souza) et **Iguanes** (CP Emmanuel Nunez, SP Georges Monteiro).",H)
c("Qui sont le chef de troupe et l'aumônier de la première troupe, et comment s'appelle-t-elle ?","Troupe **Sainte Jeanne d'Arc**. Chef de troupe : **Léon Fabert** (jeune militaire du 6e RAC). Aumônier : **R.P. Doutremepuich**.",H)
c("À quel mouvement le scoutisme sénégalais est-il affilié en 1932 ?","Aux **Scouts de France** (affiliation officielle en 1932).",H)
c("Quelles unités apparaissent après la première troupe, et quand les routiers ?","Une meute, puis les troupes **René Caillé** et **Charles Foucault**. Les scouts aînés deviennent routiers en **1938**.",H)
# --- Rallye / progression
c("Qui est le saint patron des éclaireurs, et quand le célèbre-t-on ?","**Saint Georges**, le **23 avril**.",R)
c("Qu'est-ce que le carnet de preuves, et quelles sont ses 4 parties ?","Le manuel-guide de l'éclaireur qui lui permet de progresser. Parties : **volontaire, engagé, technicien, animateur**.",R+", Livret Carnet de Preuves.pdf")
c("Quelle est la plus haute distinction dans le scoutisme ?","Le **Loup de bronze**.",R,"Source unique (annale Rallye Dakar 2023).")
c("Qui est le premier Sénégalais à avoir reçu le Loup de bronze ?","**Albert Ndiaye**.",R,"Source unique (annale Rallye Dakar 2023).")
json.dump({"theme":1,"cards":cards},open(OUT+"cards-1.json","w"),ensure_ascii=False)
print(len(cards),"cartes")

plan={"cadence":[
 "4 jours par semaine, 15 à 20 minutes : lire la fiche du mois, puis répondre aux cartes du jour.",
 "1 quiz mixte par semaine (10 minutes) : le thème du mois et les anciens.",
 "1 bilan en fin de mois : un mini-examen sur le thème, puis reprogrammation des points faibles.",
 "Répétition espacée automatique : une carte réussie revient à J+1, J+3, J+7, J+21, puis J+60. Une carte ratée revient le lendemain."],
 "months":[
 {"n":1,"o":"Maîtriser les repères de B-P, les 15 éléments fondamentaux, la promesse, la loi, la devise et les débuts du scoutisme au Sénégal."},
 {"n":2,"o":"Connaître le cérémonial scout au Sénégal, la montée des couleurs et les objets et symboles protégés."},
 {"n":3,"o":"Comprendre la progression personnelle, le carnet de preuves, le rôle du CP et le fonctionnement des patrouilles."},
 {"n":4,"o":"Savoir ce que disent les statuts, le règlement intérieur et les procédures administratives et financières."},
 {"n":5,"o":"Maîtriser la responsabilité civile et pénale, les premiers secours et les règles de sécurité en camp."},
 {"n":6,"o":"Monter un projet de camp : fiche technique, déclaration, organisation et évaluation."},
 {"n":7,"o":"Planifier et animer une unité : réunions, techniques d'animation, pédagogie du jeu et du chant."},
 {"n":8,"o":"Connaître la Meute (louvetisme) et la Communauté (routiers) pour accompagner les passages entre branches."},
 {"n":9,"o":"Situer l'action locale dans les programmes de l'OMMS et l'éducation spirituelle des branches."},
 {"n":10,"o":"Consolider topographie et matelotage, et les bases de la gestion financière d'une unité."},
 {"n":11,"o":"S'entraîner sur les annales du Rallye, de 2015 à 2023."},
 {"n":12,"o":"Quiz mixte sur toute l'année et plan de rattrapage."}]}
json.dump(plan,open(OUT+"plan.json","w"),ensure_ascii=False)

fiche={"theme":1,"titre":"Bases et histoire","intro":"Construite à partir des documents du dossier Bases Générales et du dossier Troupe. Chaque section indique ses sources.",
"sections":[
 {"h":"Baden-Powell en repères","items":[
  "**22 février 1857**, Londres. Père : pasteur protestant et professeur de géométrie à Oxford. Mère : naturaliste. Militaire de **1876 à 1910**.",
  "**Brownsea, du 29 juillet au 9 août 1907** : une vingtaine de jeunes. Premières patrouilles : **loups, taureaux, courlis, corbeaux**. Jeux d'observation et de traque, secourisme, nœuds, camping, cuisine au feu de camp.",
  "**1908** : *Scouting for Boys* (Éclaireurs). **1909** : premier rallye à Crystal Palace (10 000 éclaireurs). **1910** : B-P quitte l'armée.",
  "**1912** : mariage avec Olave Soames (30 octobre), trois enfants : Peter, Heather, Betty. **1914** : création du louvetisme. **1916** : Livre du louveteau.",
  "**1919** : camp de formation des chefs de Gilwell. **1920** : premier Jamboree mondial à Londres, B-P proclamé Chef scout du monde. **1922** : *La route du succès* (annale Rallye).",
  "**1929** : titre de Lord Baden-Powell of Gilwell. **1939** : nommé pour le Nobel de la paix. **8 janvier 1941** : décès à Nyeri (Kenya), à 83 ans."],
  "src":"Bases du scoutisme.pdf, fiches-BP.pdf, Quiz-BP.pdf, Connaissance du mvt rallye dak23.pdf"},
 {"h":"Les 15 éléments fondamentaux","items":[
  "**5 buts (acronyme SSSDF)** : Santé, Service du prochain, Sens de Dieu, Débrouillardise (sens du concret), Formation du caractère.",
  "**5 dimensions** : la nature et le camp, la patrouille, la règle du jeu (la loi scoute), le civisme (la B.A.), l'engagement (la promesse).",
  "**5 moteurs** : l'intérêt, l'action, les responsabilités, le système des patrouilles, la CDH et le CDC.",
  "Nuance du texte : le « sens de Dieu » n'est pas en soi un but défini par B-P. Le but du scoutisme n'est pas de former de futurs prêtres, mais de bons citoyens."],
  "src":"Bases du scoutisme.pdf"},
 {"h":"Promesse, loi, devise, signes","items":[
  "**Promesse** : triple engagement, être loyal, aider autrui, observer la loi scoute. Engagement volontaire, pris sur l'honneur devant ses frères.",
  "**Loi** : des « conseils de vie » proposés, pas des interdictions. Pas de sanction : une discussion pour progresser. La loi de B-P compte 10 articles, plus un 11e non écrit : « le scout n'est pas un sot ».",
  "**Devise « Sois prêt »** (Be Prepared), tirée des initiales de B-P. Trois qualités : le sens des autres, la compétence, l'observation suivie du réflexe.",
  "**B.A.** : un service gratuit, jamais contre récompense. À la meute, un plaisir fait chaque jour ; à la troupe, un réflexe d'aider ; au clan, un service permanent.",
  "**Signes** : salut de la main droite, trois doigts levés, pouce sur l'auriculaire ; poignée de main **gauche** (héritée des Ashantis) ; **fleur de lys** (indique le nord) ; trèfle pour les guides."],
  "src":"Bases du scoutisme.pdf, "+D+", fiches-BP.pdf"},
 {"h":"Le scoutisme au Sénégal : les débuts","items":[
  "**1931** : le R.P. Lecocq, curé de Dakar (Sacré-Cœur), veut créer des scouts. Naissance officieuse en décembre 1931, affiliation officielle en **1932** aux **Scouts de France**.",
  "**8 mai 1932** : première promesse de quatre garçons, dans la cour de l'école Saint Michel (Dakar), fête de Sainte Jeanne d'Arc : Gabriel Sagna, Emmanuel Nunez, Georges Monteiro, Paul de Souza.",
  "Première troupe : **Sainte Jeanne d'Arc**. Chef de troupe : Léon Fabert (jeune militaire du 6e RAC). Aumônier : R.P. Doutremepuich.",
  "Deux premières patrouilles : **Rats palmistes** (CP Gabriel Sagna, SP Paul de Souza) et **Iguanes** (CP Emmanuel Nunez, SP Georges Monteiro).",
  "Ensuite : une meute, puis les troupes René Caillé et Charles Foucault. Les scouts aînés deviennent routiers en **1938**."],
  "src":"Historique Scoutisme Senegal.pdf (Dakar Matin, 6 mai 1968)"},
 {"h":"Repères du Rallye et de la progression","items":[
  "Saint patron des éclaireurs : **saint Georges, le 23 avril**.",
  "**Carnet de preuves** : manuel-guide qui permet à l'éclaireur de progresser. 4 parties : **volontaire, engagé, technicien, animateur**.",
  "Plus haute distinction : le **Loup de bronze**. Premier Sénégalais décoré : Albert Ndiaye (source unique, l'annale Rallye Dakar 2023, à confirmer)."],
  "src":"Connaissance du mvt rallye dak23.pdf, La Progression Personnelle.pdf, Livret Carnet de Preuves.pdf"}],
"vigilance":[
 "**Taille d'une patrouille** : huit dans *Bases du scoutisme* (récit des débuts), cinq à sept dans *LE SCOUTISME.docx* (dossier Troupe) et la fiche EDLN. À confirmer avec le Manuel du CP (décembre).",
 "**Création de la Route** : 1918 selon l'annale Rallye, 1919 selon *Bases du scoutisme*. Date de *La route du succès* : 1922 (annale Rallye) ou 1919 (Bases du scoutisme).",
 "**Âge des jeunes à Brownsea** : 9 à 17 ans (fiches-BP) contre 12 à 17 ans (Quiz-BP).",
 "**Promesse de B-P** : le texte original parle de Dieu et du roi. Chaque association l'adapte (Dieu, l'Église et la Patrie dans la promesse de 1932 au Sénégal)."]}
json.dump(fiche,open(OUT+"fiche-1.json","w"),ensure_ascii=False)
import re
txt=open(OUT+"cards-1.json").read()+open(OUT+"fiche-1.json").read()+open(OUT+"plan.json").read()
print("em-dash count:",txt.count("—"), "size",len(txt))
